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

import {FlmngrRequest} from "./lib/FlmngrRequest";

export interface FlmngrConfig {
    dirFiles: string;
    dirCache?: string;

    request?: FlmngrRequest; // only for integration modules, not for defining by user except custom integrations
    onLogError?: (message: string) => void; // user may optionally set this, but integration module must have a fallback value
}