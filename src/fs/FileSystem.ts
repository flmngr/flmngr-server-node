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

import {FlmngrConfig} from "../FlmngrConfig";
import {DriverLocal} from "./DriverLocal";
import {FlmngrRequest} from "../lib/FlmngrRequest";
import {MessageException} from "../lib/MessageException";
import {Message} from "../model/Message";
import {FMDir} from "../model/FMDir";
import * as pathUtils from "path";
import {Utils} from "../lib/Utils";
import {Buffer} from "buffer";
import {ReadStream} from "fs";
import {CachedFile} from "./CachedFile";
import sharp from "sharp";

export class FileSystem {

    private driverFiles: DriverLocal;

    private driverCache: DriverLocal;

    constructor(
        config: FlmngrConfig,
        protected embedPreviews: boolean,
        protected onLogError: (error: string) => void
    ) {
        let dirCache = config.dirCache ? config.dirCache : (!config.dirFiles ? null : config.dirFiles + "/.cache");
        this.driverFiles = new DriverLocal(config.dirFiles);
        this.driverCache = new DriverLocal(dirCache, true);
        this.driverFiles.setDriverCache(this.driverCache);
    }

    private getRelativePath(path: string): string {
        if (path.indexOf("..") > -1) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                )
            );
        }

        if (path.indexOf("/") !== 0) {
            path = "/" + path;
        }

        let rootDirName = this.driverFiles.getRootDirName();

        if (path === "/Files") {
            path = "/" + rootDirName;
        }
        else {
            if (path.indexOf("/Files/") === 0) {
                path = "/" + rootDirName + "/" + path.substr(7);
            }
        }
        if (path.indexOf("/" + rootDirName) !== 0) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_INCORRECT_ROOT
                )
            );
        }

        return path.substr(("/" + rootDirName).length);
    }

    public reqGetDirs(request: FlmngrRequest): FMDir[] {
        let hideDirs = request.getParameterStringArray("hideDirs", []);

        // It's allowed to send with first slash or without it (equivalent forms).
        // The same is for trailing slash
        let dirFrom: string = request.getParameterString("fromDir", "");
        dirFrom = "/" + dirFrom.replace(/^\/+/, "").replace(/\/+$/, "");
        if (dirFrom === "/")
            dirFrom = "";
        if (dirFrom.indexOf("..") > -1) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                )
            );
        }


        // 0 means get dirs from $dirFrom only
        let maxDepth: number = request.getParameterNumber("maxDepth", 99);

        let dirs: FMDir[] = [];
        hideDirs.push(".cache");

        // Add root directory if it is ""
        let dirRoot = this.driverFiles.getRootDirName();
        let i = dirRoot.lastIndexOf("/");
        if (i > -1) {
            dirRoot = dirRoot.substr(i + 1);
        }
        dirRoot += dirFrom;

        let addFilesPrefix: boolean = dirRoot === "";

        // A flat list of child directories
        let dirsStr = this.driverFiles.allDirectories(dirFrom, maxDepth);

        // Add files
        for (const dirStr of dirsStr) {
            let dirArr = dirStr.split(/\//);
            if (addFilesPrefix) {
                dirArr.unshift("Files");
            }
            let filled = dirArr.length <= maxDepth + 1;
            dirs.push(
                new FMDir(
                    dirArr[dirArr.length - 1],
                    dirArr.slice(0, dirArr.length - 1).join("/"),
                    filled
                ).getJSON()
            );
        }

        return dirs;
    }

    public reqGetFilesPaged(request: FlmngrRequest): {
        files: {[key: string]: any}[],
        countTotal: number,
        countFiltered: number,
        isEnd: boolean
    } {
        let dirPath: string = request.getParameterString("dir");
        let maxFiles: number = request.getParameterNumber("maxFiles", 0);
        if (maxFiles < 1) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.MALFORMED_REQUEST
                )
            );
        }

        let alwaysInclude = request.getParameterStringArray("alwaysInclude", []);
        let lastFile = request.getParameterString("lastFile", null);
        let lastIndex = request.getParameterNumber("lastIndex", null);
        let whiteList = request.getParameterStringArray("whiteList", []);
        let blackList = request.getParameterStringArray("blackList", []);
        let filter = request.getParameterString("filter", "*");
        let orderBy = request.getParameterString("orderBy");
        let orderAsc = request.getParameterString("orderAsc");
        let formatIds = request.getParameterStringArray("formatIds");
        let formatSuffixes = request.getParameterStringArray("formatSuffixes", []);

        // Convert /root_dir/1/2/3 to 1/2/3
        dirPath = this.getRelativePath(dirPath);

        let now = new Date().getTime();
        let start = now;

        let files: [string|number, string|number, string|number, string][] = []; // file name to sort values (like [filename, date, size]),
                                     // 4-th value (index = 3) is always name
        let formatFiles: {[format: string]: {[name: string]: string}} = {}; // format to array(owner file name to file name)
        for (const formatId of formatIds) {
            formatFiles[formatId] = {};
        }

        let fFiles = this.driverFiles.files(dirPath);
        now = this.profile("Scan dir", now);

        for (const file of fFiles) {

            let format = null;

            let name = Utils.getNameWithoutExt(file.name);
            if (Utils.isImage(file.name)) {
                for (let i = 0; i < formatIds.length; i++) {
                    let isFormatFile = name.endsWith(formatSuffixes[i]);
                    if (isFormatFile) {
                        format = formatIds[i];
                        name = name.substr(0, name.length - formatSuffixes[i].length);
                        break;
                    }
                }
            }

            let ext = Utils.getExt(file.name);
            if (ext !== null) {
                name = name + "." + ext;
            }

            if (format === null) {
                switch (orderBy) {
                    case "date":
                        files.push(
                            [
                                file.mtime,
                                file.name,
                                file.size,
                                file.name
                            ]
                        );
                        break;
                    case "size":
                        files.push(
                            [
                                file.size,
                                file.name,
                                file.mtime,
                                file.name
                            ]
                        );
                        break;
                    case "name":
                    default:
                        files.push(
                            [
                                file.name,
                                file.mtime,
                                file.size,
                                file.name
                            ]
                        );
                        break;
                }
            } else {
                formatFiles[format][name] = file.name;
            }
        }
        now = this.profile("Fill image formats", now);

        // Remove files outside of white list, and their formats too
        if (whiteList.length > 0) { // only if whitelist is set
            for (let i=files.length-1; i>=0; i--) {
                let fileArr = files[i];
                let file = fileArr[3];

                let isMatch = false;
                for (const mask of whiteList) {
                    if (Utils.fmmatch(mask, file, true)) {
                        isMatch = true;
                    }
                }

                if (!isMatch) {
                    files.splice(i, 1);
                    for (const format in formatFiles) {
                        let formatFilesCurr = formatFiles[format];
                        if (file in formatFilesCurr) {
                            delete formatFilesCurr[file];
                        }
                    }
                }
            }
        }

        now = this.profile("White list", now);

        // Remove files outside of black list, and their formats too
        for (let i=files.length-1; i>=0; i--) {
            let fileArr = files[i];
            let file = fileArr[3];

            let isMatch = false;
            for (const mask of blackList) {
                if (Utils.fmmatch(mask, file, true)) {
                    isMatch = true;
                }
            }

            if (isMatch) {
                files.splice(i, 1);
                for (const format in formatFiles) {
                    let formatFilesCurr = formatFiles[format];
                    if (file in formatFilesCurr)
                        delete formatFilesCurr[file];
                }
            }
        }

        let countTotal = files.length;

        now = this.profile("Black list", now);

        // Remove files not matching the filter, and their formats too
        for (let i=files.length-1; i>=0; i--) {
            let fileArr = files[i];
            let file = fileArr[3];

            let isMatch = Utils.fmmatch(filter, file, false);
            if (!isMatch) {
                files.splice(i, 1);
                for (const format in formatFiles) {
                    let formatFilesCurr = formatFiles[format];
                    if (file in formatFilesCurr) {
                        delete formatFilesCurr[file];
                    }
                }
            }
        }

        let countFiltered = files.length;

        now = this.profile("Filter", now);

        files = files.sort((arr1, arr2) => {
            for (let i = 0; i < 3; i++) { // do not sort by 3-rd parameter (always a name)
                if (typeof arr1[i] === "string") {

                    let v = Utils.strnatcmp(arr1[i] as string, arr2[i] as string);
                    if (v !== 0) {
                        return v;
                    }
                } else {
                    if (arr1[i] > arr2[i]) {
                        return 1;
                    }
                    if (arr1[i] < arr2[i]) {
                        return -1;
                    }
                }
            }
            return 0;
        });

        let fileNames = files.map(f => f[3]);

        if (orderAsc.toLowerCase() !== "true") {
            fileNames = fileNames.reverse();
        }

        now = this.profile("Sorting", now);

        let startIndex = 0;
        if (!!lastIndex) {
            startIndex = lastIndex + 1;
        }
        if (!!lastFile) { // `lastFile` priority is higher than `lastIndex`
            let i = fileNames.indexOf(lastFile);
            if (i > -1) {
                startIndex = i + 1;
            }
        }

        let isEnd = startIndex + maxFiles >= fileNames.length; // are there any files after current page?

        // fileNames = fileNames.slice(startIndex, maxFiles);
        // Do the same, but respecting "alwaysInclude":
        if (startIndex > 0 || maxFiles < fileNames.length) {
            for (let i = alwaysInclude.length - 1; i >= 0; i--) {
                let index = fileNames.indexOf(alwaysInclude[i]);
                if (index === -1) {
                    // Remove unexisting items from "alwaysInclude"
                    alwaysInclude.splice(i, 1);
                } else {
                    // And existing items from "fileNames"
                    fileNames.splice(index, 1);
                }
            }
            // Get a page
            fileNames = fileNames.slice(startIndex, maxFiles);
            // Add to the start of the page all "alwaysInclude" files
            for (let i = alwaysInclude.length - 1; i >= 0; i--)
                fileNames.unshift(alwaysInclude[i]);
        }

        for (let i=0; i<fileNames.length; i++) {
            if (!(
                alwaysInclude.indexOf(fileNames[i]) > -1 ||
                (i >= startIndex && i < startIndex + maxFiles)
            )) {
                fileNames[i] = null; // First mark as NULLs elements to delete
            }
        }
        // Then delete NULLs
        fileNames = fileNames.filter(f => f !== null);

        now = this.profile("Page slice", now);

        let resultFiles: {[key: string]: any}[] = [];

        // Create result file list for output,
        // attach image attributes and image formats for image files.
        for (const fileName of fileNames) {

            let resultFile = this.getFileStructure(dirPath, fileName);

            // Find formats of these files
            for (const formatId of formatIds) {
                if (fileName in formatFiles[formatId]) {
                    let formatFileName = formatFiles[formatId][fileName];

                    let formatFile = this.getFileStructure(dirPath, formatFileName);
                    resultFile["formats"][formatId] = formatFile;
                }
            }

            resultFiles.push(resultFile);
        }

        now = this.profile("Create output list", now);
        this.profile("Total", start);

        return {
            files: resultFiles,
            countTotal: countTotal,
            countFiltered: countFiltered,
            isEnd: isEnd
        };
    }

    public getFileStructure(dirPath: string, fileName: string): {[key: string]: any} {
        let cachedImageInfo = this.getCachedImageInfo(dirPath + "/" + fileName);
        let resultFile: {[key: string]: any} = {
            name: fileName,
            size: cachedImageInfo.size,
            timestamp: cachedImageInfo.mtime
        };

        if (Utils.isImage(fileName)) {

            resultFile.width = cachedImageInfo.width || null;
            resultFile.height = cachedImageInfo.height || null;
            resultFile.blurHash = cachedImageInfo.blurHash || null;

            resultFile.formats = [];
        }

        return resultFile;
    }

    public async reqGetImagePreview(request: FlmngrRequest): Promise<{
        mimeType: string,
        readStream: ReadStream
    }> {
        let filePath = request.getParameterString("f");
        //let width = request.getParameterNumber("width", null);
        //let height = request.getParameterNumber("height", null);

        filePath = this.getRelativePath(filePath);
        let result = await this.getCachedImagePreview(filePath, null);

        // Convert path to contents
        return {
            mimeType: result.mimeType,
            readStream: (!result.isPathFromCacheFolder ? this.driverFiles : this.driverCache).readStream(result.path)
        }
    }

    public async reqGetImagePreviewAndResolution(request: FlmngrRequest): Promise<{
        width: number,
        height: number,
        preview: string|null
    }> {

        let filePath = request.getParameterString("f");
        let width = request.getParameterString("width", null);
        let height = request.getParameterString("height", null);

        filePath = this.getRelativePath(filePath);
        let previewAndResolution = await this.getCachedImagePreviewAndResolution(filePath, null);

        return {
            width: previewAndResolution.width,
            height: previewAndResolution.height,
            preview: previewAndResolution.path != null ? (
                "data:" + previewAndResolution.mimeType + ";base64," +
                (!previewAndResolution.isPathFromCacheFolder ? this.driverFiles : this.driverCache).get(previewAndResolution.path).toString("base64")
            ) : null
        };
    }

    public reqCopyDir(request: FlmngrRequest): void {
        let dirPath = request.getParameterString("d"); // full path
        let newPath = request.getParameterString("n"); // full path

        dirPath = this.getRelativePath(dirPath);
        newPath = this.getRelativePath(newPath);

        this.driverFiles.copyDirectory(dirPath, newPath);
    }

    public reqCopyFiles(request: FlmngrRequest): void {
        let files = request.getParameterString("fs", null);
        if (!files || files === "") {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.MALFORMED_REQUEST
                )
            );
        }

        let newPath = request.getParameterString("n");

        let filesPaths = files.split(/\|/g);
        for (let i = 0; i < filesPaths.length; i++) {
            filesPaths[i] = this.getRelativePath(filesPaths[i]);
        }
        newPath = this.getRelativePath(newPath);

        for (let i = 0; i < filesPaths.length; i++) {
            this.driverFiles.copyFile(filesPaths[i], newPath.replace(/\/+$/, '') + "/" + pathUtils.basename(filesPaths[i]));
        }
    }

    private getCachedFile(filePath: string): CachedFile {
        return new CachedFile(
            filePath,
            this.driverFiles,
            this.driverCache,
            this.onLogError
        );
    }

    private static PREVIEW_WIDTH = 159;

    private static PREVIEW_HEIGHT = 139;

    public getCachedImageInfo(filePath: string): {[key: string]: any} {
        let start = new Date().getTime();
        let result = this.getCachedFile(filePath).getInfo();
        this.profile("getCachedImageInfo: " + filePath, start);
        return result;
    }

    public async getCachedImagePreview(filePath: string, contents: Buffer): Promise<{
        mimeType: string,
        path: string,
        isPathFromCacheFolder: boolean // true - from real folder, i. e. SVGs do not have a cached previews, an original is used
    }> {
        let start = new Date().getTime();
        let result = await this.getCachedFile(filePath).getPreview(FileSystem.PREVIEW_WIDTH, FileSystem.PREVIEW_HEIGHT, contents);
        this.profile("getCachedImagePreview: " + filePath, start);
        return result;
    }

    public async getCachedImagePreviewAndResolution(filePath: string, contents: Buffer): Promise<{
        mimeType: string,
        path: string,
        isPathFromCacheFolder: boolean,
        width: number,
        height: number
    }> {
        let start = new Date().getTime();
        let cachedFile = this.getCachedFile(filePath);

        let preview = await cachedFile.getPreview(FileSystem.PREVIEW_WIDTH, FileSystem.PREVIEW_HEIGHT, contents);
        let info = cachedFile.getInfo();

        this.profile("getCachedImagePreviewAndResolution: " + filePath, start);

        return {
            ...preview,
            width: info.width,
            height: info.height
        };
    }

    public reqCreateDir(request: FlmngrRequest): void {
        let dirPath = request.getParameterString("d");
        let name = request.getParameterString("n");

        dirPath = this.getRelativePath(dirPath);

        if (!name || name.length === 0) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.MALFORMED_REQUEST
                )
            );
        }

        if (name.indexOf("/") > -1) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                )
            );
        }
        this.driverFiles.makeDirectory(dirPath + "/" + name);
    }

    public reqDeleteDir(request: FlmngrRequest): void {
        let dirPath = request.getParameterString("d");

        dirPath = this.getRelativePath(dirPath);

        this.driverFiles.delete(dirPath);
    }

    public reqMove(request: FlmngrRequest): void {
        let path = request.getParameterString("d");
        let newPath = request.getParameterString("n"); // path without name

        path = this.getRelativePath(path);
        newPath = this.getRelativePath(newPath);

        this.driverFiles.move(path, newPath + "/" + pathUtils.basename(path));
    }

    public reqRename(request: FlmngrRequest): void {
        let path = request.getParameterString("d", null);
        if (!path)
            path = request.getParameterString("f", null);
        let newName = request.getParameterString("n"); // name without path

        if (newName.indexOf("/") > - 1) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                )
            );
        }

        path = this.getRelativePath(path);

        this.driverFiles.move(path, pathUtils.dirname(path).replace(/\/+$/, '') + "/" + newName);
    }

    public reqMoveFiles(request: FlmngrRequest): void {
        let filePathsStr = request.getParameterString("fs", null);
        if (!filePathsStr) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.MALFORMED_REQUEST
                )
            );
        }
        let filesPaths = filePathsStr.split(/\|/); // array of file paths
        let newPath = request.getParameterString("n"); // dir without filename

        filesPaths = filesPaths.map(filePath => this.getRelativePath(filePath));
        newPath = this.getRelativePath(newPath);

        for (const filePath of filesPaths) {
            let index = filePath.lastIndexOf("/");
            let name = index === -1 ? filePath : filePath.substr(index + 1);
            this.driverFiles.move(filePath, newPath + "/" + name);
        }
    }

    // TODO: Currently we delete another image formats, probably we should regenerate them
    protected updateFormatsAndClearCachePreviewForFile(filePath: string, formatSuffixes: string[]|null): void {
        let fullPaths: string[] = [];

        let index = filePath.lastIndexOf(".");
        let fullPathPrefix: string;
        if (index > -1) {
            fullPathPrefix = filePath.substr(0, index);
        } else {
            fullPathPrefix = filePath;
        }
        if (!!formatSuffixes && Array.isArray(formatSuffixes)) {
            for (const formatSuffix of formatSuffixes) {
                let exts = ["png", "jpg", "jpeg", "webp"];
                for (const ext of exts) {
                    fullPaths.push(fullPathPrefix + formatSuffix + "." + ext);
                }
            }
        }

        let cachedFile = this.getCachedFile(filePath);
        cachedFile.delete();

        for (const fullPath of fullPaths) {
            if (this.driverFiles.fileExists(fullPath)) {
                this.driverFiles.delete(fullPath);
            }
        }
    }

    // "suffixes" is an optional parameter (does not supported by Flmngr UI v1)
    public reqDeleteFiles(request: FlmngrRequest): void {
        let filePathsStr = request.getParameterString("fs", null);
        if (!filePathsStr) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.MALFORMED_REQUEST
                )
            );
        }
        let filesPaths = filePathsStr.split(/\|/); // array of file paths
        let formatSuffixes = request.getParameterStringArray("formatSuffixes");

        filesPaths = filesPaths.map(filePath => this.getRelativePath(filePath));

        for (const filePath of filesPaths) {
            this.driverFiles.delete(filePath);
            this.updateFormatsAndClearCachePreviewForFile(filePath, formatSuffixes);
        }
    }

    // `files` are like: "file.jpg" or "dir/file.png" - they start not with "/root_dir/"
    // This is because we need to validate files before dir tree is loaded on a client
    public reqGetFilesSpecified(request: FlmngrRequest): {
        dir: string,
        file: {[key: string]: any}
    }[] {
        let files = request.getParameterStringArray("files");

        let result: {
            dir: string,
            file: {[key: string]: any}
        }[] = [];
        for (let file of files) {

            file = "/" + file;

            if (file.indexOf("..") > -1) {
                throw new MessageException(
                    Message.createMessage(
                        false,
                        Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                    )
                );
            }

            if (this.driverFiles.fileExists(file)) {

                result.push({
                    dir: pathUtils.dirname(file),
                    file: this.getFileStructure(pathUtils.dirname(file), pathUtils.basename(file))
                });
            }

        }
        return result;
    }

    // mode:
    // "ALWAYS"
    // To recreate image preview in any case (even it is already generated before)
    // Used when user uploads a new image and needs to get its preview

    // "DO_NOT_UPDATE"
    // To create image only if it does not exist, if exists - its path will be returned
    // Used when user selects existing image in file manager and needs its preview

    // "IF_EXISTS"
    // To recreate preview if it already exists
    // Used when file was reuploaded, edited and we recreate previews for all formats we do not need right now, but used somewhere else

    // File uploaded / saved in image editor and reuploaded: `mode` is "ALWAYS" for required formats, "IF_EXISTS" for the others
    // User selected image in file manager:                  `mode` is "DO_NOT_UPDATE" for required formats and there is no requests for the otheres
    public async reqResizeFile(request: FlmngrRequest): Promise<string> {
        // `filePath` here starts with "/", not with "/root_dir" as usual
        // so there will be no getRelativePath call
        let filePath = request.getParameterString("f");
        let newFileNameWithoutExt = request.getParameterString("n");
        let width = request.getParameterNumber("mw");
        let height = request.getParameterNumber("mh");
        let mode = request.getParameterString("mode");

        if (filePath.indexOf("..") > -1) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                )
            );
        }

        if (
            newFileNameWithoutExt.indexOf("..") > -1 ||
            newFileNameWithoutExt.indexOf("/") > -1 ||
            newFileNameWithoutExt.indexOf("\\") > -1
        ) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_DIR_NAME_CONTAINS_INVALID_SYMBOLS
                )
            );
        }

        let index = filePath.lastIndexOf("/");
        let oldFileNameWithExt = filePath.substr(index + 1);
        let newExt = "png";
        let oldExt = Utils.getExt(filePath).toLowerCase();
        if (oldExt === "jpg" || oldExt === "jpeg") {
            newExt = "jpg";
        }
        if (oldExt === "webp") {
            newExt = "webp";
        }
        let dstPath = filePath.substr(0, index) + "/" + newFileNameWithoutExt + "." + newExt;

        if (Utils.getNameWithoutExt(dstPath) === Utils.getNameWithoutExt(filePath)) {
            // This is `default` format request - we need to process the image itself without changing its extension
            dstPath = filePath;
        }

        let isDstPathExists = this.driverFiles.fileExists(dstPath);

        if (mode === 'IF_EXISTS' && !isDstPathExists) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_NOT_ERROR_NOT_NEEDED_TO_UPDATE
                )
            );
        }

        if (mode === 'DO_NOT_UPDATE' && isDstPathExists) {
            return dstPath;
        }

        let contents: Buffer = this.driverFiles.get(filePath);

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

        await this.getCachedImagePreview(filePath, contents); // to force writing image/width into cache file
        let imageInfo = this.getCachedImageInfo(filePath);

        let originalWidth = imageInfo["width"];
        let originalHeight = imageInfo["height"];

        let needToFitWidth = originalWidth > width && width > 0;
        let needToFitHeight = originalHeight > height && height > 0;
        if (needToFitWidth && needToFitHeight) {
            if (width / originalWidth < height / originalHeight) {
                needToFitHeight = false;
            } else {
                needToFitWidth = false;
            }
        }

        if (!needToFitWidth && !needToFitHeight) {
            // if we generated the preview in past, we need to update it in any case
            if (
                !isDstPathExists ||
                newFileNameWithoutExt + "." + oldExt === oldFileNameWithExt
            ) {
                // return old file due to it has correct width/height to be used as a preview
                return filePath;
            } else {
                width = originalWidth;
                height = originalHeight;
            }
        }

        let ratio: number;
        if (needToFitWidth) {
            ratio = width / originalWidth;
            height = Math.floor(originalHeight * ratio);
        }
        else if (needToFitHeight) {
            ratio = height / originalHeight;
            width = Math.floor(originalWidth * ratio);
        }

        let resizedImage = image.resize(width, height);

        this.driverFiles.put(
            dstPath,
            await resizedImage.toFormat(newExt as any).toBuffer() // newExt must be a key of FormatEnum
        );

        return dstPath;
    }

    public reqGetImageOriginal(request: FlmngrRequest): {
        mimeType: string,
        readStream: ReadStream
    } {
        let filePath = request.getParameterString("f");

        filePath = this.getRelativePath(filePath);

        let mimeType = Utils.getMimeType(filePath);
        if (mimeType == null) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FM_FILE_IS_NOT_IMAGE
                )
            );
        }

        let readStream = this.driverFiles.readStream(filePath);

        return {
            mimeType: mimeType,
            readStream: readStream
        };
    }

    public reqGetVersion(req: FlmngrRequest, framework: string): any {
        return {
            version: "5",
            build: "1",
            language: "node",
            framework: framework || "custom",
            storage: this.driverFiles.getDriverName(),
            dirFiles: this.driverFiles.getDir(),
            dirCache: this.driverCache.getDir(),
        };
    }

    public reqUpload(request: FlmngrRequest): {
        file: {[key: string]: any}
    } {

        let dir = request.getParameterString("dir", "/");
        dir = this.getRelativePath("/" + this.driverFiles.getRootDirName() + dir);

        let isOverwrite = request.getParameterString("mode", "AUTORENAME") === "OVERWRITE";

        let file = request.getParameterFile("file");
        if (!file) {
            throw new MessageException(
                Message.createMessage(
                    false,
                    Message.FILES_NOT_SET
                )
            );
        }

        let name = this.driverFiles.uploadFile(file, dir, isOverwrite);

        if (isOverwrite) {
            let formatSuffixes = request.getParameterStringArray("formatSuffixes", null);
            this.updateFormatsAndClearCachePreviewForFile(dir + "/" + name, formatSuffixes);
        }

        let resultFile = this.getFileStructure(dir, name);

        return {
            file: resultFile
        };
    }

    private profile(text: string, start: number): number {
        let now = new Date().getTime();
        let time = now - start;
        //console.log(time.toFixed(3) + " sec   " + text);
        return now;
    }

}