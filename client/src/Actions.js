// Action ek event ka naam hai jo server ya clients ko batata hai ki kya hua.
const Actions = {
    JOIN: 'join', //Direction: Client → Server
    JOINED: 'joined', //Direction: Server ➔ All Clients in Room
    CODE_CHANGE: 'code_change',//Direction: Bi-directional (Client ➔ Server ➔ Other Clients)
    DISCONNECTED: 'disconnected',//Direction: Server ➔ All Remaining Clients
    LANGUAGE_CHANGE: 'language_change',//Direction: Client ➔ Server ➔ Other Clients

    // File tree actions
    FILE_CREATE: 'file_create',//Direction: Client ➔ Server ➔ All Clients
    FILE_DELETE: 'file_delete',//Direction: Client ➔ Server ➔ All Clients
    FILE_RENAME: 'file_rename',//Direction: Client ➔ Server ➔ All Clients
    SYNC_FILES: 'sync_files',//Direction: Server ➔ Newly Joined Client
    SET_MAIN_FILE: 'set_main_file',//Direction: Client ➔ Server ➔ All Clients

    // Video call actions
    VIDEO_CALL_OFFER: 'video_call_offer',//Direction: Client A ➔ Server ➔ Client B
    VIDEO_CALL_ANSWER: 'video_call_answer',//Direction: Client B ➔ Server ➔ Client A
    VIDEO_CALL_PARTICIPANTS: 'video_call_participants',//Direction: Server ➔ Client
    ICE_CANDIDATE: 'ice_candidate',//Direction: Client ➔ Server ➔ Target Peer
    VIDEO_CALL_END: 'video_call_end',//Direction: Client ➔ Server ➔ All Call Participants
    VIDEO_CALL_ROOM_INFO: 'video_call_room_info',//Direction: Server ➔ Room Clients
    GET_VIDEO_CALL_ROOM_INFO: 'get_video_call_room_info',//Direction: Client ➔ Server
};

export default Actions;


