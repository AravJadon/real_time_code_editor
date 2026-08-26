useParams — reading dynamic URL segments

useParams() returns a plain object where each key matches a :param name from the route definition. If your route had multiple params:
// Route: /editor/:roomId/file/:fileId
const { roomId, fileId } = useParams();

useLocation gives you a snapshot of "where am I right now," including hidden metadata (state) that never appears in the URL bar. It's also commonly used as a dependency in useEffect to run code every time the route changes

useNavigate() returns a function — call it with a path string to navigate there. It's the imperative counterpart to declaratively rendering a <Navigate> (below) or clicking a <Link to="...">


useNavigate aur Navigate dono redirect karne ke liye hain, but trigger alag hai. useNavigate ek hook hai jo function return karta hai — hum usko kisi event ke response mein call karte hain, jaise button click ya form submit ke baad. Navigate ek component hai — usko hum JSX ke andar directly render karte hain, jab redirect render logic ka part ho, jaise agar user logged in nahi hai toh login page pe bhej do — bina kisi click ke, seedha render hote hi.


