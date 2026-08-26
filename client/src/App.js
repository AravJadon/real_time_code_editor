import './App.css';
import { BrowserRouter, Routes, Route } from 'react-router-dom';// routing 
import { Toaster } from 'react-hot-toast';// toast notidfiscation
// It provides a global container where react-hot-toast renders success, error, 
// and other notifications triggered anywhere in the app.
import Home from './Pages/Home';
import EditorPage from './Pages/EditorPage';

 function App() { //functional componennt
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
{/* Q4. Why wrap the app in BrowserRouter?
Components like Route, Link, useNavigate, and useParams need the routing context provided by BrowserRouter. */}
                <Routes>
                    <Route path="/" element={<Home />}></Route>
                    <Route
                        path="/editor/:roomId" // A dynamic route parameter that captures values from the UR
                        element={<EditorPage />}
                    ></Route>
                </Routes>
            </BrowserRouter>
        </>
    );
}

export default App;

// BrowserRouter uses the HTML5 History API to manage URLs and enables client-side navigation without reloading the page.
// routes -Container for all routes.
// route - maps URL to component




