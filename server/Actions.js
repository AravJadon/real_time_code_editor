const ACTIONS = {
    JOIN: 'join',
    JOINED: 'joined',
    SYNC_CODE: 'sync_code',
    CODE_CHANGE: 'code_change',
    LEAVE: 'leave',
    DISCONNECTED: 'disconnected',
    LANGUAGE_CHANGE: 'language_change',

    // File tree actions
    FILE_CREATE: 'file_create',
    FILE_DELETE: 'file_delete',
    FILE_RENAME: 'file_rename',
    FILE_SELECT: 'file_select',
    FOLDER_CREATE: 'folder_create',
    FOLDER_DELETE: 'folder_delete',
    SYNC_FILES: 'sync_files',
    SET_MAIN_FILE: 'set_main_file',

    // Video call actions
    VIDEO_CALL_OFFER: 'video_call_offer',
    VIDEO_CALL_ANSWER: 'video_call_answer',
    VIDEO_CALL_PARTICIPANTS: 'video_call_participants',
    ICE_CANDIDATE: 'ice_candidate',
    VIDEO_CALL_END: 'video_call_end',
    VIDEO_CALL_ROOM_INFO: 'video_call_room_info',
    GET_VIDEO_CALL_ROOM_INFO: 'get_video_call_room_info',
};

module.exports = ACTIONS;
