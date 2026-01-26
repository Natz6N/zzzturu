import addProperty from "./socket.js";
import useSQLiteAuthState from "./sqliteAuth.js";
import Sticker from './sticker-engine/index.js';
import {
    stickerVid
} from './sticker-engine/video-to-webp.js';
import {
    stickerImg
} from './sticker-engine/image-to-webp.js';
import {
    AudioToOpus
} from './audio-to-opus.js';

const haruka = {
    addProperty,
    useSQLiteAuthState
};

export default haruka;
export {
    Sticker,
    stickerVid,
    stickerImg,
    AudioToOpus
};