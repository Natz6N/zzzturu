import fs from 'fs-extra'
import path from 'path'
import webp from 'node-webpmux'
import ffmpeg from 'fluent-ffmpeg'
import Crypto from 'crypto'
import {
    tmpdir
} from 'os'
function isWebp(buffer) {
    return (
        buffer.slice(0, 4).toString() === 'RIFF' &&
        buffer.slice(8, 12).toString() === 'WEBP'
    );
}
async function videoToWebp(media) {
   if (isWebp(media)) {
        return media;
    }
    const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
    const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.mp4`);
    fs.writeFile(tmpFileIn, media);

    await new Promise((resolve, reject) => {
        ffmpeg(tmpFileIn)
            .on('error', reject)
            .on('end', () => resolve(true))
            .addOutputOptions([
                '-vcodec',
                'libwebp',
                '-vf',
                "scale='min(320,iw)':min'(320,ih)':force_original_aspect_ratio=decrease,fps=15, pad=320:320:-1:-1:color=white@0.0, split [a][b]; [a] palettegen=reserve_transparent=on:transparency_color=ffffff [p]; [b][p] paletteuse",
                '-loop',
                '0',
                '-ss',
                '00:00:00',
                '-t',
                '00:00:05',
                '-preset',
                'default',
                '-an',
                '-vsync',
                '0'
            ])
            .toFormat('webp')
            .save(tmpFileOut);
    });

    const buff = fs.readFile(tmpFileOut);
    fs.unlink(tmpFileOut);
    fs.unlink(tmpFileIn);
    return buff;
};

export async function stickerVid(media, metadata) {
    const wMedia = await videoToWebp(media);
    const tmpFileIn = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
    const tmpFileOut = path.join(tmpdir(), `${Crypto.randomBytes(6).readUIntLE(0, 6).toString(36)}.webp`);
    fs.writeFile(tmpFileIn, wMedia);

    if (metadata.packname || metadata.author) {
        const img = new webp.Image();
        const json = {
            'sticker-pack-id': 'https://github.com/DikaArdnt/Hisoka-Morou',
            'sticker-pack-name': metadata.packname,
            'sticker-pack-publisher': metadata.author,
            'emojis': metadata.categories ?? ['']
        };
        const exifAttr = Buffer.from([0x49, 0x49, 0x2A, 0x00, 0x08, 0x00, 0x00, 0x00, 0x01, 0x00, 0x41, 0x57, 0x07, 0x00, 0x00, 0x00, 0x00, 0x00, 0x16, 0x00, 0x00, 0x00]);
        const jsonBuff = Buffer.from(JSON.stringify(json), 'utf-8');
        const exif = Buffer.concat([exifAttr, jsonBuff]);
        exif.writeUIntLE(jsonBuff.length, 14, 4);
        await img.load(tmpFileIn);
        fs.unlink(tmpFileIn);
        img.exif = exif;
        await img.save(tmpFileOut);
        return tmpFileOut;
    }
};