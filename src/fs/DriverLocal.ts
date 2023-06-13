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

import * as fs from "fs";
import fsExtra from "fs-extra"
import * as pathUtils from "path";
import {MessageException} from "../lib/MessageException";
import {Message} from "../model/Message";
import {Utils} from "../lib/Utils";
import {Buffer} from "buffer";
import {ReadStream} from "fs";

export class DriverLocal {

    // Link to cache driver
    // NULL if we are inside cache driver instance
    private driverCache: DriverLocal;

    constructor(
        protected dir: string,
        protected isCacheDriver: boolean = false
    ) {

        this.dir = dir.replace(/\/+$/, '');

        this.makeRootDir();

        try {
            fs.accessSync(this.dir, fs.constants.R_OK);
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_DIR_IS_NOT_READABLE,
                        this.dir,
                        null,
                        null,
                        e
                    )
                );
            }
        }

        try {
            fs.accessSync(this.dir, fs.constants.W_OK);
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_DIR_IS_NOT_WRITABLE,
                        this.dir,
                        null,
                        null,
                        e
                    )
                );
            }
        }

    }

    public setDriverCache(driverCache: DriverLocal) {
        this.driverCache = driverCache;
    }

    public getDriverName() {
        return "Local";
    }

    public getDir(): string {
        return this.dir;
    }

    public size(path: string): number {
        let stats = fs.statSync(this.dir + path);
        return stats.size;
    }

    public lastModified(path: string): number {
        let stats = fs.statSync(this.dir + path);
        return stats.mtimeMs;
    }

    public makeDirectory(path: string): void {

        if (fs.existsSync(this.dir + path)) {
            let stats = fs.statSync(this.dir + path);
            if (stats.isDirectory())
                return;
        }

        try {
            fs.mkdirSync(this.dir + path, {
                mode: 0o777,
                recursive: true
            });
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_UNABLE_TO_CREATE_DIRECTORY,
                        path,
                        null,
                        null,
                        e
                    )
                );
            }
        }
    }

    public getRootDirName(): string {
        let i = this.dir.lastIndexOf("/");
        if (i === -1) {
            return this.dir;
        }
        return this.dir.substr(i + 1);
    }

    public makeRootDir(): void {
        if (!this.directoryExists("")) {
            this.makeDirectory("");
        }
    }

    private static MAX_DEPTH = 20;

    public allDirectories(dirFrom: string, maxDepth: number): string[] {

        let dirs: string[] = [];
        let fDir = this.dir + dirFrom;
        if (
            !fs.existsSync(fDir) ||
            !fs.statSync(fDir).isDirectory()
        ) {
            throw new MessageException(
                Message.createMessage(
                    this.isCacheDriver,
                    Message.FM_ROOT_DIR_DOES_NOT_EXIST
                )
            );
        }

        let hideDirs: string[] = [ ".cache" ];

        let path = "";
        if (dirFrom !== "") {
            path = (pathUtils.basename(this.dir) + '/' + pathUtils.dirname(dirFrom).replace(/\/$/, '')).replace(/\/$/, '');
        }
        this.getDirs__fill(dirs, fDir, hideDirs, path, 0, maxDepth);

        return dirs;
    }

    private getDirs__fill(dirs: string[], fDir: string, hideDirs: string[], path: string, currDepth: number, maxDepth: number): void {
        let i = fDir.lastIndexOf("/");
        let dirName: string;
        if (i > -1) {
            dirName = fDir.substr(i + 1);
        } else {
            dirName = fDir;
        }

        dirs.push((path.length > 0 ? ("/" + path) : '') + "/" + dirName);

        let rawDirs: string[];
        try {
            rawDirs = fs.readdirSync(fDir, {
                withFileTypes: true
            }).filter(
                dirent => dirent.isDirectory()
            ).map(
                dirent => dirent.name
            );
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_UNABLE_TO_LIST_CHILDREN_IN_DIRECTORY,
                        path,
                        null,
                        null,
                        e
                    )
                );
            }
        }

        for (let dir of rawDirs) {
            dir = dir.replace(fDir + "/", "");

            let isHide = false;
            for (let j=0; j < hideDirs.length && !isHide; j++) {
                isHide = isHide || Utils.fmmatch(hideDirs[j], dir, false);
            }

            if (fs.statSync(fDir + "/" + dir).isDirectory() && !isHide && currDepth < Math.min(maxDepth, DriverLocal.MAX_DEPTH)) {
                this.getDirs__fill(
                    dirs,
                    fDir + "/" + dir,
                    hideDirs,
                    path + (path.length > 0 ? "/" : "") + dirName,
                    currDepth + 1,
                    maxDepth
                );
            }
        }
    }

    public directories(path: string): string[] {
        let dirs: string[] = [];

        let rawDirs: string[];
        try {
            rawDirs = fs.readdirSync(this.dir + path, {
                withFileTypes: true
            }).filter(
                dirent => dirent.isDirectory()
            ).map(
                dirent => dirent.name
            );
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_UNABLE_TO_LIST_CHILDREN_IN_DIRECTORY,
                        path,
                        null,
                        null,
                        e
                    )
                );
            }
        }
        for (const dir of rawDirs) {
            dirs.push(dir.replace(this.dir + path + "/", ""));
        }
        return dirs;
    }

    public files(path: string): {name: string, mtime: number, size: number}[] {

        let rawFiles: string[];
        try {
            rawFiles = fs.readdirSync(this.dir + path, {
                withFileTypes: true
            }).filter(
                dirent => !dirent.isDirectory()
            ).map(
                dirent => dirent.name
            );
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_UNABLE_TO_LIST_CHILDREN_IN_DIRECTORY,
                        path,
                        null,
                        null,
                        e
                    )
                );
            }
        }

        let files: {name: string, mtime: number, size: number}[] = [];
        for (const file of rawFiles) {
            let isFile = false;
            try {
                isFile = fs.statSync(this.dir + path + "/" + file).isFile();
            } catch (e) {
                // File was deleted between listing and checking, no problem, let's continue without it
            }

            if (isFile) {
                let filename = pathUtils.basename(file);
                files.push({
                    name: filename,
                    mtime: this.lastModified(path + "/" + filename),
                    size: this.size(path + "/" + filename)
                });
            }
        }
        return files;
    }

    public move(path: string, newName: string): void {
        try {
            fs.renameSync(this.dir + path, this.dir + newName);
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_UNABLE_TO_RENAME,
                        null,
                        null,
                        null,
                        e
                    )
                );
            }
        }
    }

    public getMimeType(path: string): string {
        return Utils.getMimeType(this.dir + path);
    }

    public exists(path: string): boolean {
        return fs.existsSync(this.dir + path);
    }

    public directoryExists(path: string): boolean {
        return fs.existsSync(this.dir + path) && fs.statSync(this.dir + path).isDirectory();
    }

    public fileExists(path: string): boolean {
        return fs.existsSync(this.dir + path) && fs.statSync(this.dir + path).isFile();
    }

    // Get file contents
    public get(path: string): Buffer {
        return fs.readFileSync(this.dir + path);
    }

    // Put file contents
    public put(path: string, contents: Buffer|string): void {
        this.makeDirectory(pathUtils.dirname(path)); // ensure dir exists
        fs.writeFileSync(this.dir + path, contents);
    }

    // Dir (not empty) or file
    public delete(path: string): void {
        if (this.fileExists(path)) {
            try {
                fs.unlinkSync(this.dir + path);
            } catch (e) {
                if (e instanceof Error) {
                    throw new MessageException(
                        Message.createMessage(
                            this.isCacheDriver,
                            Message.UNABLE_TO_DELETE_FILE,
                            path,
                            null,
                            null,
                            e
                        )
                    );
                }
            }
        } else if (this.directoryExists(path)) {

            // There can be a try to delete unexisting file (in cache dir),
            // so we will have is_file() == false and fall here.
            // So there is required to check does this dir actually exists.

            // Unfortunately this is supported on Node v14 and newer. So we use `rimraf`
            // fs.rmdirSync(path, {recursive: true, force: true});

            try {
                this.deleteFolderRecursiveSync(this.dir + path);
            } catch (e) {
                if (e instanceof Error) {
                    throw new MessageException(
                        Message.createMessage(
                            this.isCacheDriver,
                            Message.FM_UNABLE_TO_DELETE_DIRECTORY,
                            null,
                            null,
                            null,
                            e
                        )
                    );
                }
            }
        }
    }

    // RimRaf has some broken code in a dependency, so we use the function got from:
    // https://stackoverflow.com/a/32197381/5459186
    private deleteFolderRecursiveSync(directoryPath: string): void {
        if (fs.existsSync(directoryPath)) {
            fs.readdirSync(directoryPath).forEach((file, index) => {
                const curPath = pathUtils.join(directoryPath, file);
                if (fs.lstatSync(curPath).isDirectory()) {
                    this.deleteFolderRecursiveSync(curPath);
                } else {
                    fs.unlinkSync(curPath);
                }
            });
            fs.rmdirSync(directoryPath);
        }
    };

    public readStream(path: string): ReadStream {
        return fs.createReadStream(this.dir + path);
    }

    public copyFile(pathSrc: string, pathDst: string): void {
        try {
            fs.copyFileSync(this.dir + pathSrc, this.dir + pathDst);
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_ERROR_ON_COPYING_FILES
                    )
                );
            }
        }
    }

    public copyDirectory(src: string, dst: string) {

        // Unfortunately this is supported on Node v16 and newer and in v20 is still experimental. So we use `fs-extra`
        // fs.cp(this.dir + src, this.dir + dst, {recursive: true});

        try {
            fsExtra.copySync(this.dir + src, this.dir + dst);
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.FM_ERROR_ON_COPYING_FILES,
                        null,
                        null,
                        null,
                        e
                    )
                );
            }
        }
    }


    private uploadFile__getName(fileName: string, dir: string, isOverwrite: boolean): string {
        let name: string = null;
        if (isOverwrite) {
            // Remove existing file if exists
            if (this.exists(dir + "/" + fileName))
                this.delete(dir + "/" + fileName);
            name = fileName;
        } else {
            // Get free file name
            let i = -1;
            let ok: boolean;
            do {
                i++;
                if (i == 0) {
                    name = fileName;
                } else {
                    name = Utils.getNameWithoutExt(fileName) + "_" + i + (Utils.getExt(fileName) != null ? "." + Utils.getExt(fileName) : "");
                }
                ok = !this.exists(dir + "/" + name);
            } while (!ok);
        }
        return name;
    }

    public uploadFile(
        file: {
          data: Buffer,
          fileName: string
        },
        dir: string,
        isOverwrite: boolean
    ): string {

        let name = this.uploadFile__getName(file.fileName, dir, isOverwrite);

        let dirDst = this.dir + dir;
        if (!fs.existsSync(dirDst)) {
            fs.mkdirSync(dirDst, {
                mode: 0o777,
                recursive: true
            });
        }

        try {
            fs.writeFileSync(dirDst + "/" + name, file.data);
        } catch (e) {
            if (e instanceof Error) {
                throw new MessageException(
                    Message.createMessage(
                        this.isCacheDriver,
                        Message.WRITING_FILE_ERROR,
                        dir + "/" + file.fileName
                    )
                );
            }
        }

        return name;
    }

}