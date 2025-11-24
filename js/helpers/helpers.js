// cursor position
export function saveCaretPosition(editable) {
    const sel = window.getSelection();
    if (!sel.rangeCount) return null;
    let range = sel.getRangeAt(0);

    const preCaretRange = range.cloneRange();
    preCaretRange.selectNodeContents(editable);
    preCaretRange.setEnd(range.endContainer, range.endOffset);

    return preCaretRange.toString().length;
}

export function restoreCaretPosition(editable, chars) {
    if (chars === null) return;

    const selection = window.getSelection();
    const range = document.createRange();
    let nodeStack = [editable], node, found = false;

    let charCount = 0;
    let endChar = chars;

    while ((node = nodeStack.pop())) {
        if (node.nodeType === 3) {
            let nextCount = charCount + node.length;
            if (!found && endChar >= charCount && endChar <= nextCount) {
                range.setStart(node, endChar - charCount);
                found = true;
                break;
            }
            charCount = nextCount;
        } else {
            let children = Array.from(node.childNodes).reverse();
            for (let child of children) nodeStack.push(child);
        }
    }

    if (found) {
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
    }
}
