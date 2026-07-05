import React , {useState} from 'react';
import { useNavigate } from 'react-router-dom';


import toast from 'react-hot-toast'
import {v4 as uuidV4} from 'uuid';
function Home() {
    const navigate = useNavigate();
    const [roomId,setRoomId]=useState("");
    const createNewRoom = (e)=>{
        e.preventDefault(); 
        const id = uuidV4();
        console.log(id);
        setRoomId(id);

        // toast popup
toast.success('Created a new room ');

    }


    const [username,setUsername]=useState('');


    // join room

    const joinRoom =()=>{
        if(!roomId || !username){
            toast.error("Room Id and Username is required");
            return ;
        }
        // if all aare present then redirect it
        navigate(`/editor/${roomId}`,{
            state:{
                username
            }
        })
    };

    const handleInputEnter =(e)=>{
        if(e.code === 'Enter'){
            joinRoom();
        }
    };
    return (
        <div className='container-fluid'>

            <div className='row justify-content-center align-items-center min-vh-100'>
                <div  />

                <img
                    src={'/images/synccode_logo_highres.png'}
                    alt="SyncCode Logo"
                />

                <h1 className='text-center'>
                    Real Time Collaborative Code Editor
                </h1>

                <div className="form-group">
                    <label>Enter the room id</label>
                    <input
                        type="text"
                        placeholder="Room ID"
                        value={roomId}
                        onChange={(e)=>setRoomId(e.target.value)}
                        onKeyUp={handleInputEnter}
                    />
                    <br />

                    <label>Enter the user name</label>
                    <input
                        type="text"
                        placeholder="User Name"
                        onChange ={(e)=>setUsername(e.target.value)}
                        value={username}
                        onKeyUp={handleInputEnter}
                    />
                </div>

                <button onClick={joinRoom} className='btn btn-primary mt-4'>
                    JOIN
                </button>

                <div />

                <p>
                    Didn't have a roomId?{" "}
                    <span onClick={createNewRoom} style={{ cursor: "pointer" }}>
                        CREATE NOW
                    </span>
                </p>

            </div>

        </div>
    );
}

export default Home;