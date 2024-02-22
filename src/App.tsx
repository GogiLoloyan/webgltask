import Couch from "./Couch";
import { CouchContextProvider } from "./store";

function App() {
  return (
    <CouchContextProvider containerId="model__container">
      <div className="App"><Couch /></div>
    </CouchContextProvider>
  );
}

export default App;
