import React from "react";


const Client = ({ username }) => {
    return (
        <div className="client">
            <div className="userLogo">
                {username.charAt(0).toUpperCase()}
            </div>

            <span className="username">
                {username}
            </span>
        </div>
    );
};

export default Client;