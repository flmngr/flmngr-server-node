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

import {FlmngrConfig} from "./FlmngrConfig";
import {FlmngrRequest} from "./lib/FlmngrRequest";
import {FileSystem} from "./fs/FileSystem";
import {MessageException} from "./lib/MessageException";
import {Message} from "./model/Message";
import {ReadStream} from "fs";

export class FlmngrServer {

    static async flmngrRequest(
        config: FlmngrConfig,
        on: {
            onFinish: (
                httpStatusCode: number,
                headers: { [key: string]: string },
                response: string |                             // - only together with httpStatusCode != 200
                          { error: string|null, data: any } |  // - normal response
                          ReadStream                           // - when sending a file
            ) => void,
            onLogError: (message: string) => void
        },
        framework?: string
    ) {

        let resp: { error: string|null, data: any };
        try {

            let codec = config.request.getParameterString("codec", "0");
            if (codec !== "0") {
                config.request = FlmngrServer.decodeRequest(config.request, codec);
                if (!!config.request) { // decodeRequest returns null if error
                    on.onLogError("Unknown codec = " + codec + " received from the client. You need to update the server side or check did you set Flmngr.codec correctly.");
                    on.onFinish(500, null, "An error occurred on the server side. Please check server logs.");
                    return;
                }
            }

            let fileSystem = new FileSystem(
                config,
                !!config.request.getParameterString("embedPreviews", null),
                on.onLogError
            );

            let data: any = true;
            switch (config.request.getParameterString("action")) {
                case "dirList":
                    data = fileSystem.reqGetDirs(config.request);
                    break;
                case "dirCreate":
                    fileSystem.reqCreateDir(config.request);
                    break;
                case "dirRename":
                    fileSystem.reqRename(config.request);
                    break;
                case "dirDelete":
                    fileSystem.reqDeleteDir(config.request);
                    break;
                case "dirCopy":
                    fileSystem.reqCopyDir(config.request);
                    break;
                case "dirMove":
                    fileSystem.reqMove(config.request);
                    break;
                case "fileListPaged":
                    data = fileSystem.reqGetFilesPaged(config.request);
                    break;
                case "fileListSpecified":
                    data = fileSystem.reqGetFilesSpecified(config.request);
                    break;
                case "fileDelete":
                    fileSystem.reqDeleteFiles(config.request);
                    break;
                case "fileCopy":
                    fileSystem.reqCopyFiles(config.request);
                    break;
                case "fileRename":
                    fileSystem.reqRename(config.request);
                    break;
                case "fileMove":
                    fileSystem.reqMoveFiles(config.request);
                    break;
                case "fileResize2":
                    data = await fileSystem.reqResizeFile2(config.request);
                    break;
                case "fileResize":
                    data = await fileSystem.reqResizeFile(config.request);
                    break;
                case "fileOriginal":
                    let resultReqGetImageOriginal = fileSystem.reqGetImageOriginal(config.request);

                    on.onFinish(
                        200,
                        {
                            "Content-Type": resultReqGetImageOriginal.mimeType
                        },
                        resultReqGetImageOriginal.readStream
                    );
                    return; // exit after
                case "filePreview":
                    let resultReqGetImagePreview = await fileSystem.reqGetImagePreview(config.request);
                    on.onFinish(
                        200,
                        {
                            "Content-Type": resultReqGetImagePreview.mimeType
                        },
                        resultReqGetImagePreview.readStream
                    );
                    return;
                case "filePreviewAndResolution":
                    data = await fileSystem.reqGetImagePreviewAndResolution(config.request);
                    break;
                case "uploadFile":
                case "upload":
                    data = fileSystem.reqUpload(config.request);
                    break;
                case "getVersion":
                    data = await fileSystem.reqGetVersion(config.request, framework);
                    break;
                default:
                    throw new MessageException(Message.createMessage(false, Message.ACTION_NOT_FOUND));
            }
            resp = {
                error: null,
                data: data
            };

        } catch (e) {
            if (e instanceof MessageException) {
                on.onLogError(
                    "MessageException '" + e.constructor.name + "' occurred. Message: " + e.message + "\n" + e.stack +
                    (
                        !!e.getParentException() ?
                            "\nparent exception was '" + e.getParentException().name + "'. Message: " + e.getParentException().message + "\n" + e.getParentException().stack :
                            ""
                    )
                );
                resp = {
                    error: e.getJSON(),
                    data: null
                };
            } else if (e instanceof Error) {
                on.onLogError("Exception '" + e.constructor.name + "' occurred. Message: " + e.message + "\n" + e.stack);
                on.onFinish(500, null, "An error occurred on the server side. Please check server logs.");
                return;
            }
        }

        if (!!resp.error) {
            on.onLogError("Action '" + config.request.getParameterString("action") + "' returned an error: " + resp.error);
        }

        on.onFinish(
            200,
            {
                "Content-Type": "application/json; charset=UTF-8"
            },
            resp
        );
    }

    private static decodeRequest(request: FlmngrRequest, codec: string): FlmngrRequest|null {
        if (codec === "1") {
            return {
                getParameterNumber(name: string, defaultValue?: number): number {

                    let decodedName = btoa(name);
                    let strValue = request.getParameterString(decodedName, null);

                    let isCorrectNumber = true;
                    if (strValue !== null) {
                        isCorrectNumber = "" + parseInt(strValue) === strValue;
                    } else {
                        isCorrectNumber = false;
                    }

                    if (isCorrectNumber)
                        return parseInt(strValue);
                    else
                        return defaultValue;
                },
                getParameterString(name: string, defaultValue?: string): string {
                    let decodedName = btoa(name);
                    let value = request.getParameterString(decodedName, null);
                    if ((value === null) && typeof defaultValue === "string") {
                        return defaultValue;
                    }
                    if (!!value) {
                        return atob(value);
                    } else {
                        return null;
                    }
                },
                getParameterStringArray(name: string, defaultValue?: string[]): string[] {
                    let decodedName = btoa(name);
                    let value = request.getParameterStringArray(decodedName, null);
                    if ((value === null) && Array.isArray(defaultValue)) {
                        return defaultValue;
                    }
                    if (!!value) {
                        return value.map(v => atob(v));
                    } else {
                        return null;
                    }
                },
                getParameterFile(name: string): { data: Buffer; fileName: string } {
                    return request.getParameterFile(name);
                }

            }
        }
        return null;
    }

}