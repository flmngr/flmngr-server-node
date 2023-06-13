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

import wcmatch from "./wildcard-match";
import {strnatcmp} from "./locutus/strnatcmp";
import * as fsx from "fs-extra";

export class Utils {

    public static fmmatch(wildcardPattern: string, stringToTest: string, caseInsensitive: boolean): boolean {
        return wcmatch(
            wildcardPattern,
            caseInsensitive ? {flags: "i"} : undefined
        )(stringToTest);
    }

    public static strnatcmp(str1: string, str2: string): number {
        return strnatcmp(str1, str2);
    }

    public static getMimeType(filePath: string) {
        let mimeType = null;
        filePath = filePath.toLowerCase();
        if (filePath.endsWith(".png")) {
            mimeType = "image/png";
        }
        if (filePath.endsWith(".gif")) {
            mimeType = "image/gif";
        }
        if (filePath.endsWith(".bmp")) {
            mimeType = "image/bmp";
        }
        if (
            filePath.endsWith(".jpg") ||
            filePath.endsWith(".jpeg")
        ) {
            mimeType = "image/jpeg";
        }
        if (filePath.endsWith(".webp")) {
            mimeType = "image/webp";
        }
        if (filePath.endsWith(".svg")) {
            mimeType = "image/svg+xml";
        }
        return mimeType;
    }

    public static getNameWithoutExt(filename: string): string {
        let ext: string = Utils.getExt(filename);
        if (ext == null)
            return filename;
        return filename.substring(0, filename.length - ext.length - 1);
    }

    public static getExt(name: string): string {
        let i = name.lastIndexOf('.');
        if (i > -1)
            return name.substring(i+1);
        return '';
    }

    public static getFreeFileName(dir: string, defaultName: string, alwaysWithIndex: boolean): string {
        let ok: boolean;
        let i: number = alwaysWithIndex ? 0 : -1;
        let name: string;
        do {
            i++;
            if (i === 0)
                name = defaultName;
            else
                name = Utils.getNameWithoutExt(defaultName) + "_" + i + (Utils.getExt(defaultName) != null ? "." + Utils.getExt(defaultName) : "");
            let file: string = dir + name;
            ok = !fsx.existsSync(file);
        } while (!ok);
        return name;
    }


    public static readonly PROHIBITED_SYMBOLS = "/\\?%*:|\"<>";

    public static fixFileName(name: string): string {
        let newName: string = "";
        for (let i=0; i<name.length; i++) {
            let ch: string = name.substring(i, i+1);
            if (Utils.PROHIBITED_SYMBOLS.indexOf(ch) > -1)
                ch = "_";
            newName += ch;
        }
        return newName.toString();
    }

    public static isFileNameSyntaxOk(name: string): boolean {
        if (name.length === 0 || name === "." || name.indexOf("..") > -1)
            return false;

        for (let i=0; i<Utils.PROHIBITED_SYMBOLS.length; i++)
            if (name.indexOf(Utils.PROHIBITED_SYMBOLS.charAt(i)) > -1)
                return false;

        if (name.length > 260)
            return false;

        return true;
    }

    public static isImage(name: string): boolean {
        let exts: string[] = ["gif", "jpg", "jpeg", "png", "svg", "webp", "bmp"];
        let ext = Utils.getExt(name);
        for (let i=0; i<exts.length; i++)
            if (exts[i] === ext)
                return true;
        return false;
    }

}