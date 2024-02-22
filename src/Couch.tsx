import { observer } from "mobx-react-lite";

import { useCouchStore } from "./store";
import './style.css'

const materialTextures = [
    {
        url: "img/stroheim@2x.jpg",
        name: "stroheim"
    },
    {
        url: "img/royal@2x.jpg",
        name: "clintz"
    },
    {
        url: "img/jacklyn@2x.jpg",
        name: "jacklyn"
    },
    {
        url: "img/dana@2x.jpg",
        name: "dana"
    }
];

const woodTextures = [
    {
        url: "img/blonde@2x.jpg",
        name: "blonde"
    },
    {
        url: "img/dark@2x.jpg",
        name: "dark"
    },
    {
        url: "img/walnut@2x.jpg",
        name: "walnut"
    }
];

function Couch() {
    const couchStore = useCouchStore();

    return (
        <div>
            <div className="container">
                <div className="controls__container">
                    {couchStore.isCouchActive && (
                        <div className="fabric__container">
                            <div className="textures__list">
                                <p>SELECT FABRIC</p>
                                {materialTextures.map(({ name, url }) => (
                                    <div
                                        key={name}
                                        className="pattern__container"
                                        style={{ backgroundImage: `url('/${url}')` }}
                                        onClick={() => couchStore.setMaterialTexture(url)}
                                    />
                                ))}
                            </div>
                            <div className="textures__list">
                                <p>SELECT WOOD</p>
                                {woodTextures.map(({ name, url }) => (
                                    <div
                                        key={name}
                                        className="pattern__container"
                                        style={{ backgroundImage: `url('/${url}')` }}
                                        onClick={() => couchStore.setWoodTexture(url)}
                                    />
                                ))}
                            </div>
                        </div>
                    )}
                    {!couchStore.isCouchActive && <button className="show-couch-btn" onClick={() => couchStore.showCouch()}>Show Couch</button>}
                    <p>Controls</p>
                    <div className="controls__list">
                        <button className="btn auto-rotate-btn" onClick={() => couchStore.toggleAutoRotate()}>Auto rotate</button>
                    </div>
                    {/* other controls */}
                    {/* we can add controls to the everithing by providing those APIs */}
                </div>
                <div className="model__container" id="model__container">
                    <center>Drag couch to view different angles</center>
                </div>
            </div>
        </div>

    );
}

export default observer(Couch);
