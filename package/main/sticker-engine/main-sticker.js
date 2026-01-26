import fs from 'fs-extra';
import ffmpeg from "fluent-ffmpeg";
import ffmpegPath from "ffmpeg-static";
import ffprobePath from "ffprobe-static";
import {
    stickerVid
} from './video-to-webp.js';
import {
    stickerImg
} from './image-to-webp.js';
import path from 'path';
import {
    tmpdir
} from 'os';
import Crypto from 'crypto';

ffmpeg.setFfmpegPath(ffmpegPath);
ffmpeg.setFfprobePath(ffprobePath.path);

function isVideo(input) {
    return new Promise((resolve) => {
        ffmpeg.ffprobe(input, (err, metadata) => {
            if (err) {
                console.log("ffprobe error:", err);
                return resolve(false);
            }

            const isVideo = metadata.streams.some(
                (s) => s.codec_type === "video"
            );

            resolve(isVideo);
        });
    });
}

async function bufferToTmp(buffer, ext = '.bin') {
    const tmp = path.join(
        tmpdir(),
        Crypto.randomBytes(6).toString('hex') + ext
    )
    await fs.writeFile(tmp, buffer)
    return tmp
}

class Sticker {
    constructor(media, options = {}) {
        this.media = media
        this.pack = options.pack || 'Made By'
        this.author = options.author || 'Unknown'
        this.categories = options.categories ?? ['']
    }

    async toStickerImg() {
        let buff =
            Buffer.isBuffer(this.media) ?
            this.media :
            /^data:.*?\/.*?;base64,/i.test(this.media) ?
            Buffer.from(this.media.split(',')[1], 'base64') :
            /^https?:\/\//.test(this.media) ?
            Buffer.from(await (await fetch(this.media)).arrayBuffer()) :
            fs.existsSync(this.media) ?
            await fs.readFile(this.media) :
            Buffer.alloc(0)

        let buffer = await stickerImg(buff, {
            packname: this.pack,
            author: this.author
        });
        return await fs.readFile(buffer)
    }

    async toStickerVid() {
        let buff =
            Buffer.isBuffer(this.media) ?
            this.media :
            /^data:.*?\/.*?;base64,/i.test(this.media) ?
            Buffer.from(this.media.split(',')[1], 'base64') :
            /^https?:\/\//.test(this.media) ?
            Buffer.from(await (await fetch(this.media)).arrayBuffer()) :
            fs.existsSync(this.media) ?
            await fs.readFile(this.media) :
            Buffer.alloc(0)

        let buffer = await stickerVid(buff, {
            packname: this.pack,
            author: this.author
        });

        return await fs.readFile(buffer)
    }

    async build() {
        const buff =
            Buffer.isBuffer(this.media) ?
            this.media :
            fs.existsSync(this.media) ?
            await fs.readFile(this.media) :
            Buffer.alloc(0);

        const tmpPath = await bufferToTmp(buff);
        const thisVideo = await isVideo(tmpPath);

        return thisVideo ?
            await this.toStickerVid() :
            await this.toStickerImg()
    }
}

export default Sticker