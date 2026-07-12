export const DEFAULT_LANGUAGE = 'javascript';

export const LANGUAGE_OPTIONS = [
    { value: 'javascript', label: 'JavaScript (Node.js 22)' },
    { value: 'python', label: 'Python 3.14' },
    { value: 'cpp', label: 'C++ (GCC 14)' },
    { value: 'c', label: 'C (GCC 14)' },
    { value: 'java', label: 'Java 17' },
    { value: 'csharp', label: 'C#' },
    { value: 'go', label: 'Go 1.23' },
    { value: 'rust', label: 'Rust 1.85' },
    { value: 'typescript', label: 'TypeScript 5.6' },
    { value: 'php', label: 'PHP 8.3' },
    { value: 'ruby', label: 'Ruby' },
    { value: 'bash', label: 'Bash' },
];

export function getLanguageLabel(language) {
    return (
        LANGUAGE_OPTIONS.find((option) => option.value === language)?.label ||
        language
    );
}
