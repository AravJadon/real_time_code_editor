import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import Home from './Pages/Home';
import EditorPage from './Pages/EditorPage';

function App() {
    return (
        <>
            <div>
                <Toaster
                    position="top-right"
                    toastOptions={{
                        style: {
                            background: '#1c2233',
                            color: '#e8ecf4',
                            border: '1px solid rgba(255,255,255,0.08)',
                            borderRadius: '10px',
                            fontSize: '13px',
                            fontFamily: "'Inter', sans-serif",
                            boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
                        },
                        success: {
                            iconTheme: {
                                primary: '#4ade80',
                                secondary: '#1c2233',
                            },
                        },
                        error: {
                            iconTheme: {
                                primary: '#f87171',
                                secondary: '#1c2233',
                            },
                        },
                    }}
                ></Toaster>
            </div>
            <BrowserRouter>
                <Routes>
                    <Route path="/" element={<Home />}></Route>
                    <Route
                        path="/editor/:roomId"
                        element={<EditorPage />}
                    ></Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}

export default App;
