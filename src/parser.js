(function(){
    if(doc && window.Worker){
        var REGEXP_SCRIPT_SRC = /(^|.*\/)gordon.(min\.)?js$/,
            scripts = doc.getElementsByTagName("script"),
            src = '',
            i = scripts.length;
        while(i--){
            var path = scripts[i].src;
            if(REGEXP_SCRIPT_SRC.test(path)){
                src = path;
                break;
            }
        }
        worker = new Worker(src);
        
        Gordon.Parser = function(data, ondata){
            var t = this,
                w = t._worker = worker;
            t.data = data;
            t.ondata = ondata;
            
            w.onmessage = function(e){
                t.ondata(e.data);
            };
            
            w.postMessage(data);
        };
    }else{
        Gordon.Parser = function(url, ondata){
            var xhr = new XMLHttpRequest(),
                t = this;
            xhr.open("GET", url, false);
            xhr.overrideMimeType("text/plain; charset=x-user-defined");
            xhr.send();
            if(200 != xhr.status){ throw new Error("Unable to load " + url + " status: " + xhr.status); }
            if(ondata) { t.ondata = ondata; }
            var s = t._stream = new Gordon.Stream(xhr.responseText),
                sign = s.readString(3),
                v = Gordon.validSignatures,
                version = s.readUI8(),
                fileLen = s.readUI32(),
                h = Gordon.tagHandlers,
                f = Gordon.tagCodes.SHOW_FRAME;
            if(sign == v.COMPRESSED_SWF){ s.decompress(); }
            else if(sign != v.SWF){ throw new Error(url + " is not a SWF movie file"); }
            this.ondata({
                type: "header",
                version: version,
                fileLength: fileLen,
                frameSize: s.readRect(),
                frameRate: s.readUI16() / 256,
                frameCount: s.readUI16()
            });
            t._dictionary = {};
            t._jpegTables = null;
            do{
                var frm = {
                    type: "frame",
                    displayList: {}
                };
                do{
                    var hdr = s.readUI16(),
                        code = hdr >> 6,
                        len = hdr & 0x3f,
                        handl = h[code];
                    if(0x3f == len){ len = s.readUI32(); }
                    var offset = s.offset;
                    if(code){
                        if(code == f){
                            t.ondata(frm);
                            break;
                        }
                        if(t[handl]){ t[handl](s, offset, len, frm); }
                        else{ s.seek(len); }
                    }
                }while(code && code != f);
            }while(code);
        };
        Gordon.Parser.prototype = {
            ondata: function(data){
                postMessage(data);
            },
            
            _handleDefineShape: function(s, offset, len, frm, withAlpha){
                var id = s.readUI16(),
                    shape = {
                        type: "shape",
                        id: id,
                        bounds: s.readRect()
                    }
                    t = this,
                    fillStyles = t._readFillStyles(s, withAlpha),
                    lineStyles = t._readLineStyles(s, withAlpha),
                    edges = t._readEdges(s, fillStyles, lineStyles, withAlpha);
                if(edges instanceof Array){
                    var segments = shape.segments = [];
                    for(var i = 0, seg = edges[0]; seg; seg = edges[++i]){ segments.push({
                        type: "shape",
                        id: id + '-' + (i + 1),
                        commands: edges2cmds(seg.records, !!seg.line),
                        fill: seg.fill,
                        line: seg.line
                    }); }
                }else{
                    shape.commands = edges2cmds(edges.records, !!edges.line),
                    shape.fill = edges.fill,
                    shape.line = edges.line
                }
                t.ondata(shape);
                t._dictionary[id] = shape;
                return t;
            },
            
            _readEdges: function(s, fillStyles, lineStyles, withAlpha, morph){
                var numFillBits = s.readUB(4),
                    numLineBits = s.readUB(4),
                    x1 = 0,
                    y1 = 0,
                    x2 = 0,
                    y2 = 0,
                    seg = [],
                    i = 0,
                    isFirst = true,
                    edges = [],
                    leftFill = 0,
                    rightFill = 0,
                    fsOffset = 0,
                    lsOffset = 0,
                    leftFillEdges = {},
                    rightFillEdges = {},
                    line = 0,
                    lineEdges = {},
                    c = Gordon.styleChangeStates,
                    countFChanges = 0,
                    countLChanges = 0,
                    useSinglePath = true;
                do{
                    var type = s.readUB(1),
                        flags = null;
                    if(type){
                        var isStraight = s.readBool(),
                            numBits = s.readUB(4) + 2,
                            cx = null,
                            cy = null;
                        x1 = x2;
                        y1 = y2;
                        if(isStraight){
                            var isGeneral = s.readBool();
                            if(isGeneral){
                                x2 += s.readSB(numBits);
                                y2 += s.readSB(numBits);
                            }else{
                                var isVertical = s.readBool();
                                    if(isVertical){ y2 += s.readSB(numBits); }
                                    else{ x2 += s.readSB(numBits); }
                                }
                        }else{
                            cx = x1 + s.readSB(numBits);
                            cy = y1 + s.readSB(numBits);
                            x2 = cx + s.readSB(numBits);
                            y2 = cy + s.readSB(numBits);
                        }
                        seg.push({
                            i: i++,
                            f: isFirst,
                            x1: x1, y1: y1,
                            cx: cx, cy: cy,
                            x2: x2, y2: y2
                        });
                        isFirst = false;
                    }else{
                        if(seg.length){
                            push.apply(edges, seg);
                            if(leftFill){
                                var idx = fsOffset + leftFill,
                                    list = leftFillEdges[idx] || (leftFillEdges[idx] = []);
                                for(var j = 0, edge = seg[0]; edge; edge = seg[++j]){
                                    var e = cloneEdge(edge),
                                        tx1 = e.x1,
                                        ty1 = e.y1;
                                    e.i = i++;
                                    e.x1 = e.x2;
                                    e.y1 = e.y2;
                                    e.x2 = tx1;
                                    e.y2 = ty1;
                                    list.push(e);
                                }
                            }
                            if(rightFill){
                                var idx = fsOffset + rightFill,
                                    list = rightFillEdges[idx] || (rightFillEdges[idx] = []);
                                push.apply(list, seg);
                            }
                            if(line){
                                var idx = lsOffset + line,
                                    list = lineEdges[idx] || (lineEdges[idx] = []);
                                push.apply(list, seg);
                            }
                            seg = [];
                            isFirst = true;
                        }
                        var flags = s.readUB(5);
                        if(flags){
                            if(flags & c.MOVE_TO){
                                var numBits = s.readUB(5);
                                x2 = s.readSB(numBits);
                                y2 = s.readSB(numBits);
                            }
                            if(flags & c.LEFT_FILL_STYLE){
                                leftFill = s.readUB(numFillBits);
                                countFChanges++;
                            }
                            if(flags & c.RIGHT_FILL_STYLE){
                                rightFill = s.readUB(numFillBits);
                                countFChanges++;
                            }
                            if(flags & c.LINE_STYLE){
                                line = s.readUB(numLineBits);
                                countLChanges++;
                            }
                            if((leftFill && rightFill) || countFChanges + countLChanges > 2){ useSinglePath = false; }
                            if(flags & c.NEW_STYLES){
                                fsOffset = fillStyles.length;
                                lsOffset = lineStyles.length;
                                push.apply(fillStyles, t._readFillStyles(s, withAlpha || morph));
                                push.apply(lineStyles, t._readLineStyles(s, withAlpha || morph));
                                numFillBits = s.readUB(4);
                                numLineBits = s.readUB(4);
                                useSinglePath = false;
                            }
                        }
                    }
                }while(type || flags);
                s.align();
                if(useSinglePath){
                    var fill = leftFill || rightFill;
                    return {
                        records: edges,
                        fill: fill ? fillStyles[fsOffset + fill - 1] : null,
                        line: lineStyles[lsOffset + line - 1]
                    };
                }else{
                    var segments = [];
                    for(var i = 0; fillStyles[i]; i++){
                        var fill = i + 1,
                            list = leftFillEdges[fill],
                            fillEdges = [],
                            edgeMap = {};
                        if(list){ push.apply(fillEdges, list); }
                        list = rightFillEdges[fill];
                        if(list){ push.apply(fillEdges, list); }
                        for(var j = 0, edge = fillEdges[0]; edge; edge = fillEdges[++j]){
                            var key = pt2key(edge.x1, edge.y1),
                                list = edgeMap[key] || (edgeMap[key] = []);
                            list.push(edge);
                        }
                        var recs = [],
                            countFillEdges = fillEdges.length,
                            l = countFillEdges - 1;
                        for(var j = 0; j < countFillEdges && !recs[l]; j++){
                            var edge = fillEdges[j];
                            if(!edge.c){
                                var seg = [],
                                    firstKey = pt2key(edge.x1, edge.y1),
                                    usedMap = {};
                                do{
                                    seg.push(edge);
                                    usedMap[edge.i] = true;
                                    var key = pt2key(edge.x2, edge.y2),
                                        list = edgeMap[key],
                                        favEdge = fillEdges[j + 1],
                                        nextEdge = null;
                                    if(key == firstKey){
                                        var k = seg.length;
                                        while(k--){ seg[k].c = true; }
                                        push.apply(recs, seg);
                                        break;
                                    }
                                    if (!(list && list.length)){ break; }
                                    for(var k = 0; list[k]; k++){
                                        var entry = list[k];
                                        if(entry == favEdge && !entry.c){
                                            list.splice(k, 1);
                                            nextEdge = entry;
                                        }
                                    }
                                    if(!nextEdge){
                                        for(var k = 0; list[k]; k++){
                                            var entry = list[k];
                                            if(!(entry.c || usedMap[entry.i])){ nextEdge = entry; }
                                        }
                                    }
                                    edge = nextEdge;
                                }while(edge);
                            }
                        }
                        var l = recs.length;
                        if(l){ segments.push({
                            records: recs,
                            fill: fillStyles[i],
                            "_index": recs[l - 1].i
                        }); }
                    }
                    var i = lineStyles.length;
                    while(i--){
                        var recs = lineEdges[i + 1];
                        if(recs){ segments.push({
                            records: recs,
                            line: lineStyles[i],
                            _index: recs[recs.length - 1].i
                        }); }
                    }
                    segments.sort(function(a, b){
                        return a._index - b._index;
                    });
                    if(segments.length > 1){ return segments; }
                    else{ return segments[0]; }
                }
            },
            
            _readFillStyles: function(s, withAlpha, morph){
                var numStyles = s.readUI8(),
                    styles = [];
                if(0xff == numStyles){ numStyles = s.readUI16(); }
                while(numStyles--){
                    var type = s.readUI8(),
                        f = Gordon.fillStyleTypes;
                    switch(type){
                        case f.SOLID:
                            if(morph){ styles.push([s.readRGBA(), s.readRGBA()]); }
                            else{ styles.push(withAlpha ? s.readRGBA() : s.readRGB()); }
                            break;
                        case f.LINEAR_GRADIENT:
                        case f.RADIAL_GRADIENT:
                            if(morph){ var matrix = [nlizeMatrix(s.readMatrix()), nlizeMatrix(s.readMatrix())]; }
                            else{ var matrix = nlizeMatrix(s.readMatrix()); }
                            var stops = [],
                                style = {
                                    type: type == f.LINEAR_GRADIENT ? "linear" : "radial",
                                    matrix: matrix,
                                    spread: morph ? Godon.spreadModes.PAD : s.readUB(2),
                                    interpolation: morph ? Godon.interpolationModes.RGB : s.readUB(2),
                                    stops: stops
                                },
                                numStops = s.readUB(4);
                            while(numStops--){
                                var offset = s.readUI8() / 256,
                                    color = withAlpha || morph ? s.readRGBA() : s.readRGB();
                                stops.push({
                                    offset: morph ? [offset, s.readUI8() / 256] : offset,
                                    color: morph ? [color, s.readRGBA()] : color
                                });
                            }
                            styles.push(style);
                            break;
                        case f.REPEATING_BITMAP:
                        case f.CLIPPED_BITMAP:
                            var imgId = s.readUI16(),
                                img = this._dictionary[imgId],
                                matrix = morph ? [s.readMatrix(), s.readMatrix()] : s.readMatrix();
                            if(img){
                                styles.push({
                                    type: "pattern",
                                    image: img,
                                    matrix: matrix,
                                    repeat: type == f.REPEATING_BITMAP
                                });
                            }else{ styles.push(null); }
                            break;
                    }
                }
                return styles;
            },
            
            _readLineStyles: function(s, withAlpha, morph){
                var numStyles = s.readUI8(),
                    styles = [];
                if(0xff == numStyles){ numStyles = s.readUI16(); }
                while(numStyles--){
                    var width = s.readUI16(),
                        color = withAlpha || morph ? s.readRGBA() : s.readRGB()
                    styles.push({
                        width: morph ? [width, s.readUI16()] : width,
                        color: morph ? [color, s.readRGBA()] : color
                    });
                }
                return styles;
            },
            
            _handlePlaceObject: function(s, offset, len, frm){
                var objId = s.readUI16(),
                    depth = s.readUI16(),
                    t = this,
                    character = {
                        object: t._dictionary[objId].id,
                        depth: depth,
                        matrix: s.readMatrix()
                    };
                if(s.offset - offset != len){ character.cxform = s.readCxform(); }
                frm.displayList[depth] = character;
                return t;
            },
            
            _handleRemoveObject: function(s, offset, len, frm){
                var id = s.readUI16(),
                    depth = s.readUI16();
                frm.displayList[depth] = null;
                return this;
            },
            
            _handleDefineBits: function(s, offset, len, frm, withAlpha){
                var id = s.readUI16(),
                    img = {
                        type: "image",
                        id: id,
                        width: 0,
                        height: 0
                    },
                    t = this,
                    h = t._jpegTables;
                if(withAlpha){
                    var alphaDataOffset = s.readUI32(),
                        data = s.readString(alphaDataOffset);
                    img.alphaData = s.readString(len - (s.offset - offset));
                }else{ var data = s.readString(len - 2); }
                for(var i = 0; data[i]; i++){
                    var word = ((data.charCodeAt(i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
                    if(0xffd9 == word){
                        word = ((data.charCodeAt(++i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
                        if(word == 0xffd8){
                            data = data.substr(0, i - 4) + data.substr(i);
                            i -= 4;
                        }
                    }else if(0xffc0 == word){
                        i += 3;
                        img.height = ((data.charCodeAt(++i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
                        img.width = ((data.charCodeAt(++i) & 0xff) << 8) | (data.charCodeAt(++i) & 0xff);
                        break;
                    }
                }
                img.data = h ? h.substr(0, h.length - 2) + data.substr(2) : data;
                t.ondata(img);
                t._dictionary[id] = img;
                return t;
            },
            
            _handleDefineButton: function(s, offset, len, frm, advanced){
                var id = s.readUI16(),
                    t = this,
                    d = t._dictionary,
                    states = {},
                    button = {
                        type: "button",
                        id: id,
                        states: states,
                        trackAsMenu: advanced ? s.readBool(8) : false
                    };
                    if(advanced){ s.seek(2); }
                do{
                    var flags = s.readUI8();
                    if(flags){
                        var objId = s.readUI16(),
                            depth = s.readUI16(),
                            state = 0x01,
                            character = {
                                object: d[objId].id,
                                depth: depth,
                                matrix: s.readMatrix()
                            };
                            if(advanced){ character.cxform = s.readCxformA(); }
                        while(state <= 0x08){
                            if(flags & state){
                                var list = states[state] || (states[state] = {});
                                list[depth] = character;
                            }
                            state <<= 1;
                        }
                    }
                }while(flags);
                button.action = t._readAction(s, s.offset, len - (s.offset - offset));
                t.ondata(button);
                d[id] = button;
                return t;
            },
            
            _readAction: function(s, offset, len){
                s.seek(len - (s.offset - offset));
                return '';
            },
            
            _handleJpegTables: function(s, offset, len){
                this._jpegTables = s.readString(len);
                return this;
            },
            
            _handleSetBackgroundColor: function(s, offset, len, frm){
                frm.bgcolor = s.readRGB();
                return this;
            },
            
            _handleDefineFont: function(s){
                var id = s.readUI16(),
                    numGlyphs = s.readUI16() / 2,
                    glyphs = [],
                    t = this,
                    font = {
                        type: "font",
                        id: id,
                        glyphs: glyphs
                    };
                s.seek(numGlyphs * 2 - 2);
                while(numGlyphs--){ glyphs.push(t._readGlyph(s)); }
                t.ondata(font);
                t._dictionary[id] = font;
                return t;
            },
            
            _readGlyph: function(s){
                var numFillBits = s.readUB(4),
                    numLineBits = s.readUB(4),
                    x = 0,
                    y = 0,
                    cmds = [],
                    c = Gordon.styleChangeStates;
                do{
                    var type = s.readUB(1),
                        flags = null;
                    if(type){
                        var isStraight = s.readBool(),
                            numBits = s.readUB(4) + 2;
                        if(isStraight){
                            var isGeneral = s.readBool();
                            if(isGeneral){
                                x += s.readSB(numBits);
                                y += s.readSB(numBits);
                                cmds.push('L' + x + ',' + y);
                            }else{
                                var isVertical = s.readBool();
                                if(isVertical){
                                    y += s.readSB(numBits);
                                    cmds.push('V' + y);
                                }else{
                                    x += s.readSB(numBits);
                                    cmds.push('H' + x);
                                }
                            }
                        }else{
                            var cx = x + s.readSB(numBits),
                                cy = y + s.readSB(numBits);
                            x = cx + s.readSB(numBits);
                            y = cy + s.readSB(numBits);
                            cmds.push('Q' + cx + ',' + cy + ',' + x + ',' + y);
                        }
                    }else{
                        var flags = s.readUB(5);
                        if(flags){
                            if(flags & c.MOVE_TO){
                                var numBits = s.readUB(5);
                                x = s.readSB(numBits);
                                y = s.readSB(numBits);
                                cmds.push('M' + x + ',' + y);
                            }
                            if(flags & c.LEFT_FILL_STYLE || flags & c.RIGHT_FILL_STYLE){ s.readUB(numFillBits); }
                        }
                    }
                }while(type || flags);
                s.align();
                return {commands: cmds.join('')};
            },
            
            _handleDefineText: function(s, offset, length, frm, withAlpha){
                var id = s.readUI16(),
                    strings = [],
                    txt = {
                        type: "text",
                        id: id,
                        bounds: s.readRect(),
                        matrix: s.readMatrix(),
                        strings: strings
                    },
                    numGlyphBits = s.readUI8(),
                    numAdvBits = s.readUI8(),
                    fontId = null,
                    fill = null,
                    x = 0,
                    y = 0,
                    size = 0,
                    str = null,
                    d = this._dictionary;
                do{
                    var hdr = s.readUB(8);
                    if(hdr){
                        var type = hdr >> 7;
                        if(type){
                            var flags = hdr & 0x0f;
                            if(flags){
                                var f = Gordon.textStyleFlags;
                                if(flags & f.HAS_FONT){ fontId = s.readUI16(); }
                                if(flags & f.HAS_COLOR){ fill = withAlpha ? s.readRGBA() : s.readRGB(); }
                                if(flags & f.HAS_XOFFSET){ x = s.readSI16(); }
                                if(flags & f.HAS_YOFFSET){ y = s.readSI16(); }
                                if(flags & f.HAS_FONT){ size = s.readUI16(); }
                            }
                            str = {
                                font: d[fontId].id,
                                fill: fill,
                                x: x,
                                y: y,
                                size: size,
                                entries: []
                            };
                            strings.push(str);
                        }else{
                            var numGlyphs = hdr & 0x7f,
                                entries = str.entries;
                            while(numGlyphs--){
                                var idx = s.readUB(numGlyphBits),
                                    adv = s.readSB(numAdvBits);
                                entries.push({
                                    index: idx,
                                    advance: adv
                                });
                                x += adv;
                            }
                            s.align();
                        }
                    }
                }while(hdr);
                this.ondata(txt);
                d[id] = txt;
                return this;
            },
            
            _handleDoAction: function(s, offset, len, frm){
                frm.action = this._readAction(s, offset, len);
                return this;
            },
            
            _handleDefineFontInfo: function(s, offset, len){
                var d = this._dictionary,
                    fontId = s.readUI16(),
                    font = d[fontId],
                    codes = [],
                    f = font.info = {
                        name: s.readString(s.readUI8()),
                        isSmall: s.readBool(3),
                        isShiftJIS: s.readBool(),
                        isANSI: s.readBool(),
                        isItalic: s.readBool(),
                        isBold: s.readBool(),
                        codes: codes
                    },
                    u = f.isUTF8 = s.readBool(),
                    i = font.glyphs.length;
                while(i--){ codes.push(u ? s.readUI16() : s.readUI8()); }
                this.ondata(font);
                d[fontId] = font;
                return this;
            },
            
            _handleDefineBitsLossless: function(s, offset, len, frm, withAlpha){
                var id = s.readUI16(),
                    format = s.readUI8(),
                    img = {
                        type: "image",
                        id: id,
                        width: s.readUI16(),
                        height: s.readUI16(),
                        withAlpha: withAlpha
                    };
                if(format == Gordon.bitmapFormats.COLORMAPPED){ img.colorTableSize = s.readUI8() + 1; }
                img.colorData = s.readString(len - (s.offset - offset));
                this.ondata(img);
                this._dictionary[id] = img;
                return this;
            },
            
            _handleDefineBitsJpeg2: function(s, offset, len){
                return this._handleDefineBits(s, offset, len);
            },
            
            _handleDefineShape2: function(s, offset, len){
                return this._handleDefineShape(s, offset, len);
            },
            
            _handleDefineButtonCxform: function(s){
                var t = this,
                    d = t._dictionary,
                    buttonId = s.readUI16(),
                    button = d[buttonId];
                button.cxform = s.readCxform();
                t.ondata(button);
                d[buttonId] = button;
                return t;
            },
            
            _handleProtect: function(s, offset, len){
                s.seek(len);
                return this;
            },
            
            _handlePlaceObject2: function(s, offset, len, frm){
                var flags = s.readUI8(),
                    depth = s.readUI16(),
                    f = Gordon.placeFlags,
                    character = {depth: depth},
                    t = this;
                if(flags & f.HAS_CHARACTER){
                    var objId = s.readUI16();
                    character.object = t._dictionary[objId].id;
                }
                if(flags & f.HAS_MATRIX){ character.matrix = s.readMatrix(); }
                if(flags & f.HAS_CXFORM){ character.cxform = s.readCxformA(); }
                if(flags & f.HAS_RATIO){ character.ratio = s.readUI16(); }
                if(flags & f.HAS_NAME){ character.name = s.readString(); }
                if(flags & f.HAS_CLIP_DEPTH){ character.clipDepth = s.readUI16(); }
                if(flags & f.HAS_CLIP_ACTIONS){ s.seek(len - (s.offset - offset)) }
                frm.displayList[depth] = character;
                return t;
            },
            
            _handleRemoveObject2: function(s, offset, len, frm){
                var depth = s.readUI16();
                frm.displayList[depth] = null;
                return this;
            },
            
            _handleDefineShape3: function(s, offset, len, frm){
                return this._handleDefineShape(s, offset, len, frm, true);
            },
            
            _handleDefineText2: function(s, offset, len, frm){
                return this._handleDefineText(s, offset, len, frm, true);
            },
            
            _handleDefineButton2: function(s, offset, len, frm){
                return t._handleDefineButton(s, offset, len, frm, true);
            },
            
            _handleDefineBitsJpeg3: function(s, offset, len, frm){
                return this._handleDefineBits(s, offset, len, frm, true);
            },
            
            _handleDefineBitsLossless2: function(s, offset, len, frm){
                return this._handleDefineBitsLossless(s, offset, len, frm, true);
            },
            
            _handleDefineSprite: function(s, offset, len){
                var id = s.readUI16(),
                    frameCount = s.readUI16(),
                    h = Gordon.tagHandlers,
                    f = Gordon.tagCodes.SHOW_FRAME,
                    c = Gordon.controlTags,
                    timeline = [],
                    sprite = {
                        id: id,
                        timeline: timeline
                    },
                    t = this;
                do{
                    var frm = {
                        type: "frame",
                        displayList: {}
                    };
                    do{
                        var hdr = s.readUI16(),
                            code = hdr >> 6,
                            len = hdr & 0x3f,
                            handl = h[code];
                        if(0x3f == len){ len = s.readUI32(); }
                        var offset = s.offset;
                        if(code){
                            if(code == f){
                                timeline.push(c);
                                break;
                            }
                            if(c[code] && t[handl]){ t[handl](s, offset, len, frm); }
                            else{ s.seek(len); }
                        }
                    }while(code);
                }while(code);
                t.ondata(sprite);
                t._dictionary[id] = sprite;
                return t;
            },
            
            _handleFrameLabel: function(s, offset, len, frm){
                frm.label = s.readString();
                return this;
            },
            
            _handleDefineMorphShape: function(s, offset, len){
                var id = s.readUI16(),
                    startBounds = s.readRect(),
                    endBounds = s.readRect(),
                    endEdgesOffset = s.readUI32(),
                    t = this,
                    fillStyles = t._readFillStyles(s, true, true),
                    lineStyles = t._readLineStyles(s, true, true),
                    morph = {
                        type: "morph",
                        id: id,
                        startEdges: t._readEdges(s, fillStyles, lineStyles, true, true),
                        endEdges: t._readEdges(s, fillStyles, lineStyles, true, true)
                    };
                t.ondata(morph);
                t._dictionary[id] = morph;
                return t;
            },
            
            _handleDefineFont2: function(s, offset, len){
                var id = s.readUI16(),
                    hasLayout = s.readBool(),
                    glyphs = [],
                    font = {
                        type: "font",
                        id: id,
                        glyphs: glyphs
                    },
                    codes = [],
                    f = font.info = {
                        isShiftJIS: s.readBool(),
                        isSmall: s.readBool(),
                        isANSI: s.readBool(),
                        useWideOffsets: s.readBool(),
                        isUTF8: s.readBool(),
                        isItalic: s.readBool(),
                        isBold: s.readBool(),
                        languageCode: s.readLanguageCode(),
                        name: s.readString(s.readUI8()),
                        codes: codes
                    },
                    i = numGlyphs = s.readUI16(),
                    w = f.useWideOffsets,
                    offsets = [],
                    tablesOffset = s.offset,
                    u = f.isUTF8;
                while(i--){ offsets.push(w ? s.readUI32() : s.readUI16()); }
                s.seek(w ? 4 : 2);
                for(var i = 0, o = offsets[0]; o; o = offsets[++i]){
                    s.seek(tablesOffset + o, true);
                    glyphs.push(this._readGlyph(s));
                }
                var i = numGlyphs;
                while(i--){ codes.push(u ? s.readUI16() : s.readUI8()); };
                if(hasLayout){
                    f.ascent = s.readUI16();
                    f.descent = s.readUI16();
                    f.leading = s.readUI16();
                    var advanceTable = f.advanceTable = [],
                        boundsTable = f.boundsTable = [],
                        kerningTable = f.kerningTable = [];
                    i = numGlyphs;
                    while(i--){ advanceTable.push(s.readUI16()); };
                    i = numGlyphs;
                    while(i--){ boundsTable.push(s.readRect()); };
                    var kerningCount = s.readUI16();
                    while(kerningCount--){ kerningTable.push({
                        code1: u ? s.readUI16() : s.readUI8(),
                        code2: u ? s.readUI16() : s.readUI8(),
                        adjustment: s.readUI16()
                    }); }
                }
                this.ondata(font);
                this._dictionary[id] = font;
                return this;
            }
        };
        
        function nlizeMatrix(matrix){
            return {
                scaleX: matrix.scaleX * 20, scaleY: matrix.scaleY * 20,
                skewX: matrix.skewX * 20, skewY: matrix.skewY * 20,
                moveX: matrix.moveX, moveY: matrix.moveY
            };
        }
        
        function cloneEdge(edge){
            return {
                i: edge.i,
                f: edge.f,
                x1: edge.x1, y1: edge.y1,
                cx: edge.cx, cy: edge.cy,
                x2: edge.x2, y2: edge.y2
            };
        }
        
        function edges2cmds(edges, stroke){
            var firstEdge = edges[0],
                x1 = 0,
                y1 = 0,
                x2 = 0,
                y2 = 0,
                cmds = [];
            for(var i = 0, edge = firstEdge; edge; edge = edges[++i]){
                x1 = edge.x1;
                y1 = edge.y1;
                if(x1 != x2 || y1 != y2 || !i){ cmds.push('M' + x1 + ',' + y1); }
                x2 = edge.x2;
                y2 = edge.y2;
                if(null == edge.cx || null == edge.cy){
                    if(x2 == x1){ cmds.push('V' + y2); }
                    else if(y2 == y1){ cmds.push('H' + x2); }
                    else{ cmds.push('L' + x2 + ',' + y2); }
                }else{ cmds.push('Q' + edge.cx + ',' + edge.cy + ',' + x2 + ',' + y2); }
            };
            if(!stroke && (x2 != firstEdge.x1 || y2 != firstEdge.y1)){ cmds.push('L' + firstEdge.x1 + ',' + firstEdge.y1) }
            return cmds.join('');
        }
        
        function pt2key(x, y){
            return (x + 50000) * 100000 + y;
        }
        
        win.onmessage = function(e){
            new Gordon.Parser(e.data);
        };
    }
})();
