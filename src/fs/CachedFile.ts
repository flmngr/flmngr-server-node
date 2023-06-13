/**
 *
 * Flmngr server package for Node.
 *
 * This file is a part of the server side implementation of Flmngr -
 * the JavaScript/TypeScript file manager widely used for building apps and editors.
 *
 * Comes as a standalone package for custom integrations,
 * and as a part of N1ED web content builder.
 *
 * Flmngr file manager:       https://flmngr.com
 * N1ED web content builder:  https://n1ed.com
 * Developer website:         https://edsdk.com
 *
 * License: GNU General Public License Version 3 or later
 *
 **/

import {DriverLocal} from "./DriverLocal";
import * as pathUtils from "path";
import {Buffer} from "buffer";
import {Utils} from "../lib/Utils";
import sharp, {OverlayOptions} from "sharp";
import {MessageException} from "../lib/MessageException";
import {Message} from "../model/Message";
import { encode, isBlurhashValid } from "blurhash";

export class CachedFile {

    private cacheFileRelative: string; // path/to/file.jpg (.json|.png will be added later)

    private cacheFileJsonRelative: string;

    private cacheFilePreviewRelative: string;

    constructor(
        protected fileRelative: string, // Example: /path/to/file.jpg
        protected driverFiles: DriverLocal,
        protected driverCache: DriverLocal,
        protected onLogError: (error: string) => void
    ) {
        this.cacheFileRelative = "/previews" + fileRelative;

        this.cacheFileJsonRelative = this.cacheFileRelative + ".json";
        this.cacheFilePreviewRelative = this.cacheFileRelative + ".png";

        this.driverCache.makeRootDir();
    }

    // Clears cache for this file
    public delete() {
        if (this.driverCache.exists(this.cacheFileJsonRelative)) {
            this.driverCache.delete(this.cacheFileJsonRelative);
        }
        if (this.driverCache.exists(this.cacheFilePreviewRelative)) {
            this.driverCache.delete(this.cacheFilePreviewRelative);
        }
    }

    public getInfo(): {[key: string]: any} {
        if (!this.driverCache.exists(this.cacheFileJsonRelative)) {

            try {

                // We do not calculate BlurHash/width/height here due to this is a long operation
                // BlurHash/width/height will be calculated and JSON file will be updated on the first getCachedImagePreview() call

                let info = {
                    mtime: this.driverFiles.lastModified(this.fileRelative),
                    size: this.driverFiles.size(this.fileRelative),
                };
                this.writeInfo(info);

            } catch (e) {
                if (e instanceof Error) {
                    this.onLogError(
                        "Exception while getting image size of " + this.fileRelative + ":\n" +
                        "Name: '" + e.name + "', Message: " + e.message + "\n" + e.stack
                    );
                }
            }
        }

        let content = this.driverCache.get(this.cacheFileJsonRelative).toString();
        try {
            return JSON.parse(content);
        } catch (e) {
            if (e instanceof Error) {
                this.onLogError("Unable to parse JSON from file " + this.cacheFileJsonRelative);
                return null;
            }
        }
    }

    private writeInfo(info: {[key: string]: any}) {
        let dirname = pathUtils.dirname(this.cacheFileJsonRelative);
        if (!this.driverCache.exists(dirname)) {
            this.driverCache.makeDirectory(dirname);
        }
        this.driverCache.put(this.cacheFileJsonRelative, JSON.stringify(info));
    }

    public async getPreview(previewWidth: number, previewHeight: number, contents: Buffer): Promise<{
        mimeType: string,
        path: string,
        isPathFromCacheFolder: boolean // true - from real folder, i. e. SVGs do not have a cached previews, an original is used
    }> {
        let cacheFilePreviewRelative = this.cacheFileRelative + ".png";

        if (this.driverCache.exists(cacheFilePreviewRelative)) {
            let info = this.getInfo();
            if (
                !info ||
                info["mtime"] !== this.driverFiles.lastModified(this.fileRelative) ||
                info["size"] !== this.driverFiles.size(this.fileRelative)
        ) {
                // Delete preview if it was changed, will be recreated below
                this.driverCache.delete(cacheFilePreviewRelative);
            }
        }

        let resizedImage: sharp.Sharp = null;
        let originalWidth: number;
        let originalHeight: number;
        if (!this.driverCache.exists(cacheFilePreviewRelative)) {

            if (Utils.getMimeType(this.fileRelative) === "image/svg+xml") {
                return {
                    mimeType: "image/svg+xml",
                    path: this.fileRelative,
                    isPathFromCacheFolder: false // from files folder
                };
            }

            if (contents === null) {
                contents = this.driverFiles.get(this.fileRelative);
            }

            let image: sharp.Sharp;

            try {
                image = await sharp(contents);
            } catch (e) {
                if (e instanceof Error) {
                    throw new MessageException(
                        Message.createMessage(
                            false,
                            Message.IMAGE_PROCESS_ERROR,
                            null,
                            null,
                            null,
                            e
                        )
                    );
                }
            }


            // https://sharp.pixelplumbing.com/api-operation#rotate
            // rotate() always rotates by EXIF and THEN rotates to passed angle,
            // so we need to call it without arguments to respect EXIF "Orientation" parameter
            image = await image.rotate();

            let metadata = await image.metadata();
            originalWidth = metadata.width;
            originalHeight = metadata.height;
            if (originalWidth <= 0 || originalHeight <= 0) {
                throw new MessageException(
                    Message.createMessage(false, Message.IMAGE_PROCESS_ERROR)
                );
            }

            let originalRatio = originalWidth / originalHeight;

            if (previewWidth == null) {
                previewWidth = Math.floor(originalRatio * previewHeight);
            }
            else {
                if (previewHeight === null) {
                    previewHeight = Math.floor((1 / originalRatio) * previewWidth);
                }
            }

            let previewRatio = previewWidth / previewHeight;

            if (originalRatio >= previewRatio) {
                previewHeight = Math.floor(originalHeight * previewWidth / originalWidth);
            } else {
                previewWidth = Math.floor(originalWidth * previewHeight / originalHeight);
            }

            image = image.resize(previewWidth, previewHeight);

            resizedImage = await sharp({
                create: {
                    width: previewWidth,
                    height: previewHeight,
                    channels: 3,
                    background: { r: 70, g: 20, b: 20 }
                }
            }).png();

            const rectSize = 20;
            let rectGray1 = await (await sharp({
                create: {
                    width: rectSize,
                    height: rectSize,
                    channels: 3,
                    background: { r: 240, g: 240, b: 240 }
                }
            })).png().toBuffer();
            let rectGray2 = await (await sharp({
                create: {
                    width: rectSize,
                    height: rectSize,
                    channels: 3,
                    background: { r: 250, g: 250, b: 250 }
                }
            })).png().toBuffer();

            let overlayOptions: OverlayOptions[] = [];
            for (let x = 0; x <= Math.floor(previewWidth / rectSize); x++) {
                for (let y = 0; y <= Math.floor(previewHeight / rectSize); y++) {
                    overlayOptions.push(
                        {
                            input: (((x + y) % 2 === 0) ? rectGray1 : rectGray2),
                            top: y * rectSize,
                            left: x * rectSize,
                        }
                    );
                }
            }

            resizedImage = await resizedImage.composite([
                ...overlayOptions,
                {
                    input: await image.toBuffer(),
                    top: 0,
                    left: 0,
                }
            ]);

            let imageContents: Buffer = await resizedImage.toFormat("jpg", {quality: 80}).toBuffer();

            try {
                this.driverCache.put(cacheFilePreviewRelative, imageContents);
            } catch (e) {
                if (e instanceof Error) {
                    throw new MessageException(
                        Message.createMessage(
                            true,
                            Message.FM_UNABLE_TO_WRITE_PREVIEW_IN_CACHE_DIR,
                            cacheFilePreviewRelative,
                            null,
                            null,
                            e
                        )
                    );
                }
            }
        }

        // Update BlurHash
        if (resizedImage == null) {

            try {
                resizedImage = await sharp(this.driverCache.get(cacheFilePreviewRelative));
            } catch (e) {
                if (e instanceof Error) {
                    throw new MessageException(
                        Message.createMessage(
                            false,
                            Message.IMAGE_PROCESS_ERROR,
                            null,
                            null,
                            null,
                            e
                        )
                    );
                }
            }
        }

        let blurhash: string = null;
        try {
            let resizedImageBuffer: Buffer = await resizedImage
                .raw()
                .ensureAlpha()
                .toBuffer();

            let metadata = await resizedImage.metadata();

            blurhash = encode(
                new Uint8ClampedArray(resizedImageBuffer), metadata.width, metadata.height, 4, 3
            );
            if (!isBlurhashValid(blurhash))
                blurhash = null;

        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        false,
                        Message.IMAGE_PROCESS_ERROR,
                        null,
                        null,
                        null,
                        e
                    )
                );
            }
        }


        let cachedImageInfo = this.getInfo();
        if (!!blurhash) {
            cachedImageInfo["blurHash"] = blurhash;
            if (!!originalWidth) {
                cachedImageInfo["width"] = originalWidth;
            }
            if (!!originalHeight) {
                cachedImageInfo["height"] = originalHeight;
            }
            this.writeInfo(cachedImageInfo);
        }

        return {
            mimeType: "image/png",
            path: cacheFilePreviewRelative,
            isPathFromCacheFolder: true // from cache folder
        };
    }


}