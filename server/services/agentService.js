const { ChatGoogleGenerativeAI } = require('@langchain/google-genai');
const { HumanMessage, SystemMessage } = require('@langchain/core/messages');
const { ToolMessage } = require('@langchain/core/messages');
const fileService = require('./fileService');
const { runCode } = require('./judge0Service');
const { searchSimilar } = require('./vectorStoreService');

// ─── Tool Definitions ───

const AGENT_TOOLS = [
    {
        type: 'function',
        function: {
            name: 'searchCode',
            description: 'Search across all files in the current room for code that is semantically similar to a query. Use this to find relevant functions, imports, or patterns.',
            parameters: {
                type: 'object',
                properties: {
                    query: {
                        type: 'string',
                        description: 'The search query describing what code you are looking for',
                    },
                },
                required: ['query'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'readFile',
            description: 'Read the full content of a file in the room by its name.',
            parameters: {
                type: 'object',
                properties: {
                    fileName: {
                        type: 'string',
                        description: 'The name of the file to read',
                    },
                },
                required: ['fileName'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'createFile',
            description: 'Create a new file in the room with the given name and code content.',
            parameters: {
                type: 'object',
                properties: {
                    fileName: {
                        type: 'string',
                        description: 'Name of the file to create (e.g., "utils.js")',
                    },
                    code: {
                        type: 'string',
                        description: 'The code content to write into the file',
                    },
                    language: {
                        type: 'string',
                        description: 'Programming language (e.g., "javascript", "python")',
                    },
                },
                required: ['fileName', 'code'],
            },
        },
    },
    {
        type: 'function',
        function: {
            name: 'runCode',
            description: 'Execute code using the Judge0 online compiler and return the output. Supports JavaScript, Python, C, C++, Java, Go, Rust, PHP, Ruby, and Bash.',
            parameters: {
                type: 'object',
                properties: {
                    code: {
                        type: 'string',
                        description: 'The code to execute',
                    },
                    language: {
                        type: 'string',
                        description: 'The language to run in (e.g., "javascript", "python")',
                    },
                    stdin: {
                        type: 'string',
                        description: 'Optional input to provide via stdin',
                    },
                },
                required: ['code', 'language'],
            },
        },
    },
];

// ─── Tool Execution ───

async function executeTool(toolName, args, context) {
    switch (toolName) {
        case 'searchCode': {
            const results = await searchSimilar(context.roomId, args.query, 5);
            if (results.length === 0) return 'No matching code found.';
            return results.map((r) =>
                `📄 **${r.fileName}** (similarity: ${(r.score * 100).toFixed(0)}%)\n\`\`\`\n${r.text}\n\`\`\``
            ).join('\n\n');
        }

        case 'readFile': {
            const files = await fileService.findFilesByRoom(context.roomId);
            const file = files.find((f) => f.name === args.fileName && f.type === 'file');
            if (!file) return `File "${args.fileName}" not found in this room.`;
            return `📄 **${file.name}** (${file.language || 'unknown'}):\n\`\`\`\n${file.code || '// empty'}\n\`\`\``;
        }

        case 'createFile': {
            const newFile = await fileService.createFile({
                roomId: context.roomId,
                name: args.fileName,
                type: 'file',
                code: args.code || '',
                language: args.language || 'javascript',
                parentId: null,
            });

            // Emit socket event so all room members see the new file
            if (context.io && context.roomId) {
                context.io.in(context.roomId).emit('file_create', { file: newFile });
            }

            return `✅ Created file "${args.fileName}" successfully.`;
        }

        case 'runCode': {
            try {
                const result = await runCode(args.code, args.language, args.stdin || '');
                if (result.error) {
                    return `❌ Execution Error:\n${result.error}\n\nStatus: ${result.status}`;
                }
                return `✅ Output:\n${result.output || '(no output)'}\n\nStatus: ${result.status} | Time: ${result.time}s | Memory: ${result.memory} KB`;
            } catch (err) {
                return `❌ Failed to execute code: ${err.message}`;
            }
        }

        default:
            return `Unknown tool: ${toolName}`;
    }
}

// ─── Agent Runner ───

const AGENT_SYSTEM_PROMPT = `You are an autonomous AI coding agent inside SyncCode, a real-time collaborative code editor. You have access to tools that let you search code, read files, create files, and execute code in the room's workspace.

When given a task:
1. Think step by step about what you need to do
2. Use tools to gather information and take actions
3. Report your findings and results clearly

Be proactive — if a task requires multiple steps, plan and execute them. Format your responses in markdown.`;

const MAX_AGENT_ITERATIONS = 8;

async function runAgent(options) {
    if (!process.env.API_KEY) {
        throw new Error('AI API key is not configured.');
    }

    const modelName = (process.env.AI_MODELS || process.env.AI_MODEL || 'gemini-2.5-flash').split(',')[0].trim();
    const model = new ChatGoogleGenerativeAI({
        model: modelName,
        apiKey: process.env.API_KEY,
        temperature: 0.4,
        maxOutputTokens: 2048,
    });

    const boundModel = model.bindTools(AGENT_TOOLS);

    const messages = [
        new SystemMessage(AGENT_SYSTEM_PROMPT),
        new HumanMessage(options.prompt),
    ];

    const toolCallLog = [];
    let finalResponse = '';

    for (let iteration = 0; iteration < MAX_AGENT_ITERATIONS; iteration++) {
        const response = await boundModel.invoke(messages);
        messages.push(response);

        // If no tool calls, we're done
        if (!response.tool_calls || response.tool_calls.length === 0) {
            finalResponse = typeof response.content === 'string'
                ? response.content
                : JSON.stringify(response.content);
            break;
        }

        // Execute each tool call
        for (const toolCall of response.tool_calls) {
            const toolResult = await executeTool(toolCall.name, toolCall.args, {
                roomId: options.roomId,
                io: options.io,
            });

            toolCallLog.push({
                tool: toolCall.name,
                args: toolCall.args,
                result: toolResult,
            });

            messages.push(new ToolMessage({
                content: toolResult,
                tool_call_id: toolCall.id,
            }));
        }
    }

    // If we ran out of iterations, get a final summary
    if (!finalResponse) {
        const summary = await model.invoke([
            ...messages,
            new HumanMessage('Summarize what you accomplished and any remaining work.'),
        ]);
        finalResponse = typeof summary.content === 'string'
            ? summary.content
            : JSON.stringify(summary.content);
    }

    return {
        response: finalResponse,
        toolCalls: toolCallLog,
        model: modelName,
        iterations: toolCallLog.length,
    };
}

module.exports = {
    runAgent,
};
