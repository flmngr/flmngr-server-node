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

export class FMDir {

  constructor(
      protected name: string,
      protected path: string,
      protected filled: boolean // false if its children were not listed (dynamic listing is used and this is the last level dir)
  ) {}

  public getJSON(): any {
    return {
      p: (this.path.length > 0 ? "/" + this.path : "") + "/" + this.name,
      filled: this.filled,
      f: 0, // legacy
      d: 0  // legacy
    }
  }

}
