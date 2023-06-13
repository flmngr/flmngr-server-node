// https://github.com/locutusjs/locutus/blob/aa2751437a92cc1b33204b5e1252e8ef899206ad/src/php/strings/strnatcmp.js

export function strnatcmp(a: string, b: string) {

    const leadingZeros = /^0+(?=\d)/
    const whitespace = /^\s/
    const digit = /^\d/

    if (arguments.length !== 2) {
        return null
    }

    if (!a.length || !b.length) {
        return a.length - b.length
    }

    let i = 0
    let j = 0

    a = a.replace(leadingZeros, '')
    b = b.replace(leadingZeros, '')

    while (i < a.length && j < b.length) {
        // skip consecutive whitespace
        while (whitespace.test(a.charAt(i))) i++
        while (whitespace.test(b.charAt(j))) j++

        let ac = a.charAt(i)
        let bc = b.charAt(j)
        let aIsDigit = digit.test(ac)
        let bIsDigit = digit.test(bc)

        if (aIsDigit && bIsDigit) {
            let bias = 0
            const fractional = ac === '0' || bc === '0'

            do {
                if (!aIsDigit) {
                    return -1
                } else if (!bIsDigit) {
                    return 1
                } else if (ac < bc) {
                    if (!bias) {
                        bias = -1
                    }

                    if (fractional) {
                        return -1
                    }
                } else if (ac > bc) {
                    if (!bias) {
                        bias = 1
                    }

                    if (fractional) {
                        return 1
                    }
                }

                ac = a.charAt(++i)
                bc = b.charAt(++j)

                aIsDigit = digit.test(ac)
                bIsDigit = digit.test(bc)
            } while (aIsDigit || bIsDigit)

            if (!fractional && bias) {
                return bias
            }

            continue
        }

        if (!ac || !bc) {
            continue
        } else if (ac < bc) {
            return -1
        } else if (ac > bc) {
            return 1
        }

        i++
        j++
    }

    const iBeforeStrEnd = i < a.length;
    const jBeforeStrEnd = j < b.length;

    // Check which string ended first
    // return -1 if a, 1 if b, 0 otherwise
    return ((iBeforeStrEnd > jBeforeStrEnd) ? 1 : 0) - ((iBeforeStrEnd < jBeforeStrEnd) ? 1 : 0);
}