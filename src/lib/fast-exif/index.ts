// https://github.com/titarenko/fast-exif/blob/master/src/index.ts
// but switched to sync calls from async ones

import exifReader from "exif-reader";
import * as fs from "fs";
import {Buffer} from "buffer";

export function read(fileName: string, maxIterations?: number | true): {
    /** Basic TIFF properties about the image */
    image?: Record<string, unknown>;
    /** Basic TIFF properties about the embedded thumbnail */
    thumbnail?: Record<string, unknown>;
    /** Full EXIF data */
    exif?: Record<string, unknown>;
    /** GPS/location data about the image */
    gps?: Record<string, unknown>;
    /** Interoperability information */
    interoperability?: Record<string, unknown>;
} {
    if (maxIterations === true) {
        // former isDeepSearch boolean argument
        maxIterations = Number.MAX_SAFE_INTEGER;
    }
    if (maxIterations === undefined) {
        maxIterations = 1;
    }
    let file: number;
    try {
        file = fs.openSync(fileName, "r");
        const exifBuffer = searchExif(file, maxIterations);
        if (exifBuffer) {
            const exif = exifReader(exifBuffer);
            return exif;
        }
    } finally {
        if (file) {
            fs.closeSync(file);
        }
    }
}

function searchExif(file: number, remainingIterations: number): Buffer {
    const buffer = Buffer.alloc(512);
    let fileOffset = 0;
    while (remainingIterations--) {
        const bytesRead = fs.readSync(
            file,
            buffer,
            0,
            buffer.length,
            null
        );
        if (!bytesRead) {
            return;
        }

        let bufferOffset = 0;
        while (bufferOffset < buffer.length) {
            if (buffer[bufferOffset++] == 0xff && buffer[bufferOffset] == 0xe1) {
                const exifBuffer = Buffer.alloc(buffer.readUInt16BE(++bufferOffset));
                fs.readSync(
                    file,
                    exifBuffer,
                    0,
                    exifBuffer.length,
                    fileOffset + bufferOffset + 2
                );
                return exifBuffer;
            }
        }

        fileOffset += buffer.length;
    }
}