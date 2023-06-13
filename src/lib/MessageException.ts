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

import {Message} from "../model/Message";

export class MessageException extends Error {

    constructor(
        protected msg: Message
    ) {
        super(JSON.stringify(msg.getJSON()));
    }

    public getJSON(): any {
        return this.msg.getJSON();
    }

    public getParentException(): Error|null {
        return this.msg.getParentException();
    }

}