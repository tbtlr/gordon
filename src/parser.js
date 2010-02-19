(function(){
    var useNativeJson = !!global.JSON;
    
    if(doc && global.Worker){
        var REGEXP_SCRIPT_SRC = /(^|.*\/)gordon.(min\.)?js$/;
        
        var scripts = doc.getElementsByTagName("script"),
            src = "gordon.min.js",
            i = scripts.length;
        while(i--){
            var match = REGEXP_SCRIPT_SRC.exec(scripts[i].src);
            if(match){
                src = match[0];
                break;
            }
        }
        Gordon.Parser = function(data, ondata){
            var t = this;
            t.data = data;
            t.ondata = ondata;
            var w = t._worker = new Worker(src);
            w.onerror = function(){};
            w.onmessage = function(e){
                t.ondata(useNativeJson ? JSON.parse(e.data) : e.data);
            }
            w.postMessage(data);
        };
    }else{
        var s = currFrame = null,
            dictionary = {},
            currPrivateId = 0,
            jpegTables = null;
        
        Gordon.Parser = function(data, ondata){
            if(ondata) { this.ondata = ondata; }
            s = new Gordon.Stream(data);
            var sign = s.readString(3),
                v = Gordon.validSignatures;
            if(sign != v.SWF && sign != v.COMPRESSED_SWF){ throw new Error(url + " is not a SWF movie file"); }
            var version = s.readUI8(),
                fileLen = s.readUI32();
            if(sign == v.COMPRESSED_SWF){ s.decompress(); }
            this.ondata({
                type: "header",
                version: version,
                fileLength: fileLen,
                frameSize: s.readRect(),
                frameRate: s.readUI16() / 256,
                frameCount: s.readUI16()
            });
            var h = Gordon.tagHandlers,
                f = Gordon.tagCodes.SHOW_FRAME;
            do{
                currFrame = {
                    type: "frame",
                    displayList: {}
                };
                do{
                    var hdr = s.readUI16(),
                          code = hdr >> 6,
                          len = hdr & 0x3f;
                    if(len >= 0x3f){ len = s.readUI32(); }
                    var handl = h[code];
                    if(this[handl]){ this[handl](s.tell(), len); }
                    else{ s.seek(len); }
                }while(code && code != f);
            }while(code);
        };
        Gordon.Parser.prototype = {
            ondata: function(data){
                postMessage(useNativeJson ? JSON.stringify(data) : data);
            },
            
            _handleShowFrame: function(){
                this.ondata(currFrame);
                return this;
            },
            
            _handleDefineShape: function(){
                var id = s.readUI16(),
                    bounds = s.readRect(),
                    t = this,
                    fillStyles = t._readFillStyleArray(),
                    lineStyles = t._readLineStyleArray(),
                    numFillBits = s.readUB(4),
                    numLineBits = s.readUB(4),
                    segment = [],
                    isFirst = true,
                    edges = [],
                    leftFill = rightFill = fsOffset = lsOffset = 0,
                    leftFillEdges = {},
                    rightFillEdges = {},
                    i = line = 0,
                    lineEdges = {},
                    c = Gordon.styleChangeStates,
                    x1 = y1 = x2 = y2 = 0,
                    countFillChanges = countLineChanges = 0,
                    useSinglePath = true;
                do{
                    var type = s.readUB(1),
                        flags = null;
                    if(type){
                        var isStraight = s.readBool(),
                            numBits = s.readUB(4) + 2,
                            cx = cy = null;
                        x1 = x2, y1 = y2;
                        if(isStraight){
                            var isGeneral = s.readBool();
                            if(isGeneral){
                                x2 += twips2px(s.readSB(numBits));
                                y2 += twips2px(s.readSB(numBits));
                            }else{
                                var isVertical = s.readBool();
                                    if(isVertical){ y2 += twips2px(s.readSB(numBits)); }
                                    else{ x2 += twips2px(s.readSB(numBits)); }
                                }
                        }else{
                            cx = x1 + twips2px(s.readSB(numBits));
                            cy = y1 + twips2px(s.readSB(numBits));
                            x2 = cx + twips2px(s.readSB(numBits));
                            y2 = cy + twips2px(s.readSB(numBits));
                        }
                        x2 = Math.round(x2 * 100) / 100;
                        y2 = Math.round(y2 * 100) / 100;
                        segment.push({i: i++, f: isFirst, x1: x1, y1: y1, cx: cx, cy: cy, x2: x2, y2: y2});
                        isFirst = false;
                    }else{
                        if(segment.length){
                            push.apply(edges, segment);
                            if(leftFill){
                                var indx = fsOffset + leftFill,
                                    list = leftFillEdges[indx];
                                if(!list){ list = leftFillEdges[indx] = []; }
                                segment.forEach(function(edge){
                                    var e = cloneEdge(edge),
                                        tx1 = e.x1,
                                        ty1 = e.y1;
                                    e.i = i++;
                                    e.x1 = e.x2;
                                    e.y1 = e.y2;
                                    e.x2 = tx1;
                                    e.y2 = ty1;
                                    list.push(e);
                                });
                            }
                            if(rightFill){
                                var indx = fsOffset + rightFill,
                                    list = rightFillEdges[indx];
                                if(!list){ list = rightFillEdges[indx] = []; }
                                push.apply(list, segment);
                            }
                            if(line){
                                var indx = lsOffset + line,
                                    list = lineEdges[indx];
                                if(!list){ list = lineEdges[indx] = []; }
                                push.apply(list, segment);
                            }
                            segment = [];
                            isFirst = true;
                        }
                        var flags = s.readUB(5);
                        if(flags){
                            if(flags & c.MOVE_TO){
                                var numBits = s.readUB(5);
                                  x2 = twips2px(s.readSB(numBits));
                                y2 = twips2px(s.readSB(numBits));
                                }
                                if(flags & c.LEFT_FILL_STYLE){
                                leftFill = s.readUB(numFillBits);
                                countFillChanges++;
                            }
                                if(flags & c.RIGHT_FILL_STYLE){
                                rightFill = s.readUB(numFillBits);
                                countFillChanges++;
                            }
                            if(flags & c.LINE_STYLE){
                                line = s.readUB(numLineBits);
                                countLineChanges++;
                            }
                            if((leftFill && rightFill) || (countFillChanges + countLineChanges) > 2){
                                useSinglePath = false;
                            }
                                if(flags & c.NEW_STYLES){
                                 push.apply(fillStyles, t._readFillStyleArray());
                                push.apply(lineStyles, t._readLineStyleArray());
                                numFillBits = s.readUB(4);
                                numLineBits = s.readUB(4);
                                fsOffset = fillStyles.length;
                                lsOffset = lineStyles.length;
                                useSinglePath = false;
                            }
                        }
                    }
                }while(type || flags);
                s.align();
                var shape = null,
                    shapeId = 's_' + id;
                if(useSinglePath){
                    var fill = leftFill || rightFill,
                        fillStyle = fill ? fillStyles[fsOffset + fill - 1] : null,
                        lineStyle = lineStyles[lsOffset + line - 1];
                    shape = buildShape(edges, fillStyle, lineStyle);
                    shape.id = shapeId;
                    shape.bounds = bounds;
                }else{
                    var fillShapes = [],
                        i = fillStyles.length;
                    while(i--){
                        var fill = i + 1,
                            list = leftFillEdges[fill];
                        fillEdges = [];
                        if(list){ push.apply(fillEdges, list); }
                        list = rightFillEdges[fill];
                        if(list){ push.apply(fillEdges, list); }
                        var edgeMap = {};
                        fillEdges.forEach(function(edge){
                            var key = calcPointKey(edge.x1, edge.y1),
                                list = edgeMap[key];
                            if(!list){ list = edgeMap[key] = []; }
                            list.push(edge);
                        });
                        var pathEdges = [],
                            countFillEdges = fillEdges.length;
                        for(var j = 0; j < countFillEdges && !pathEdges[countFillEdges - 1]; j++){
                            var edge = fillEdges[j];
                            if(!edge.c){
                                var segment = [],
                                    firstKey = calcPointKey(edge.x1, edge.y1),
                                    usedMap = {};
                                do{
                                    segment.push(edge);
                                    usedMap[edge.i] = true;
                                    var key = calcPointKey(edge.x2, edge.y2);
                                    if(key == firstKey){
                                        var k = segment.length;
                                        while(k--){ segment[k].c = true; }
                                        push.apply(pathEdges, segment);
                                        break;
                                    }
                                    var list = edgeMap[key];
                                    if (!(list && list.length)){ break; }
                                    var favEdge = fillEdges[j + 1],
                                        nextEdge = null;
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
                        if(pathEdges.length){
                            shape = buildShape(pathEdges, fillStyles[i]);
                            shape.index = pathEdges.pop().i;
                            fillShapes.push(shape);
                        }
                    }
                    var strokeShapes = [],
                        i = lineStyles.length;
                    while(i--){
                        var pathEdges = lineEdges[i + 1];
                        if(pathEdges){
                            shape = buildShape(pathEdges, null, lineStyles[i]);
                            shape.index = pathEdges.pop().i;
                            strokeShapes.push(shape);
                        }
                    }
                    var segments = fillShapes.concat(strokeShapes);
                    segments.sort(function(a, b){
                        return a.index - b.index;
                    });
                    if(segments.length > 1){
                        segments.forEach(function(shape, i){ shape.id = shapeId + '_' + (i + 1); });
                        shape = {
                            type: "shape",
                            id: shapeId,
                            bounds: bounds,
                            segments: segments
                        }
                    }else{
                        delete shape.index;
                        shape.id = shapeId;
                        shape.bounds = bounds;
                    }
                }
                t.ondata(shape);
                dictionary[id] = shape;
                return t;
            },
            
            _readFillStyleArray: function(){
                var numStyles = s.readUI8();
                if(0xff == numStyles){ numStyles = s.readUI16(); }
                var styles = [],
                    i = numStyles;
                while(i--){
                    var type = s.readUI8(),
                        f = Gordon.fillStyleTypes;
                    switch(type){
                        case f.SOLID:
                            styles.push(s.readRGB());
                            break;
                        case f.LINEAR_GRADIENT:
                        case f.RADIAL_GRADIENT:
                            var style = {
                                    type: type == f.LINEAR_GRADIENT ? "linear" : "radial",
                                    matrix: s.readMatrix(),
                                    spread: s.readUB(2),
                                    interpolation: s.readUB(2),
                                    stops: []
                                },
                                numStops = s.readUB(4),
                                stops = style.stops,
                                j = numStops;
                            while(j--){ stops.push({
                                offset: s.readUI8() / 255,
                                color: s.readRGB()
                            }); }
                            styles.push(style);
                            break;
                        case f.REPEATING_BITMAP:
                        case f.CLIPPED_BITMAP:
                            var imgId = s.readUI16(),
                                img = dictionary[imgId],
                                matrix = s.readMatrix();
                            if(img){
                                with(matrix){
                                    scaleX = twips2px(scaleX);
                                    scaleY = twips2px(scaleY);
                                    skewX = twips2px(skewX);
                                    skewY = twips2px(skewY);
                                }
                                styles.push({
                                    type: "pattern",
                                    image: img,
                                    matrix: matrix
                                });
                            }else{ styles.push(null); }
                            break;
                    }
                }
                return styles;
            },
            
            _readLineStyleArray: function(){
                var numStyles = s.readUI8();
                if(0xff == numStyles){ numStyles = s.readUI16(); }
                var styles = [],
                    i = numStyles;
                while(i--){ styles.push({
                    width: twips2px(s.readUI16()),
                    color: s.readRGB()
                }); }
                return styles;
            },
            
            _handlePlaceObject: function(offset, len){
                var id = s.readUI16(),
                    depth = s.readUI16(),
                    character = {
                        object: dictionary[id].id,
                        depth: depth,
                        matrix: s.readMatrix()
                    };
                if(s.tell() - offset != len){
                    var filterId = "x_" + (++currPrivateId);
                    this.ondata({
                        type: "filter",
                        id: filterId,
                        cxform: s.readCxform()
                    });
                    character.filter = filterId;
                }
                currFrame.displayList[depth] = character;
                return this;
            },
            
            _handleRemoveObject: function(){
                var id = s.readUI16(),
                    depth = s.readUI16();
                currFrame.displayList[depth] = null;
                return this;
            },
            
            _handleDefineBits: function(offset, len, withTables){
                var id = s.readUI16(),
                    jpg = this._readJpeg(len - 2);
                if(withTables){ var data = encodeBase64(jpg.data); }
                else{
                    var header = jpegTables.substr(0, jpegTables.length - 2),
                        data = encodeBase64(header + jpg.data.substr(2));
                }
                var img = {
                    type: "image",
                    id: "i_" + id,
                    uri: "data:image/jpeg;base64," + data,
                    width: jpg.width,
                    height: jpg.height
                };
                this.ondata(img);
                dictionary[id] = img;
                return this;
            },
            
            _readJpeg: function(dataSize){
                var offset = s.tell(),
                    width = height = 0;
                for(var i = 0; i < dataSize; i += 2){
                    var hdr = s.readUI16(true),
                        len = s.readUI16(true);
                    if(hdr == 0xffc0){
                        s.seek(1);
                        var height = s.readUI16(true),
                            width = s.readUI16(true);
                        break;
                    }
                }
                s.seek(offset, true);
                return {
                    data: s.readString(dataSize),
                    width: width,
                    height: height
                };
            },
            
            _handleDefineButton: function(){
                var id = s.readUI16(),
                    states = {};
                do{
                    var flags = s.readUI8();
                    if(flags){
                        var objectId = s.readUI16(),
                            depth = s.readUI16(),
                            character = {
                                object: dictionary[objectId].id,
                                depth: depth,
                                matrix: s.readMatrix()
                            },
                            state = 0x01;
                        while(state <= 0x08){
                            if(flags & state){
                                var list = states[state];
                                if(!list){ list = states[state] = {}; }
                                list[depth] = character;
                            }
                            state <<= 1;
                        }
                    }
                }while(flags);
                var button = {
                    type: "button",
                    id: "b_" + id,
                    states: states,
                    action: this._readAction()
                };
                this.ondata(button);
                dictionary[id] = button;
                return this;
            },
            
            _readAction: function(){
                var stack = [];
                do{
                    var code = s.readUI8(),
                        len = code > 0x80 ? s.readUI16() : 0,
                        a = Gordon.actionCodes;
                    switch(code){
                        case a.PLAY:
                            stack.push("t.play()");
                            break;
                        case a.STOP:
                            stack.push("t.stop()");
                            break;
                        case a.NEXT_FRAME:
                            stack.push("t.nextFrame()");
                            break;
                        case a.PREVIOUS_FRAME:
                            stack.push("t.prevFrame()");
                            break;
                        case a.GOTO_FRAME:
                            var frame = s.readUI16();
                            stack.push("t.goto(" + frame + ')');
                            break;
                        case a.GET_URL:
                            var url = s.readString(),
                                target = s.readString();
                            stack.push("t.getURL('" + url + "', '" + target + "')");
                            break;
                        case a.TOGGLE_QUALITY:
                            stack.push("t.toggleHighQuality()");
                            break;
                        default:
                            s.seek(len);
                    }
                }while(code);
                return "function(t){" + stack.join(';') + "}";
            },
            
            _handleJpegTables: function(offset, len){
                jpegTables = s.readString(len);
                return this;
            },
            
            _handleSetBackgroundColor: function(){
                currFrame.bgcolor = s.readRGB();
                return this;
            },
            
            _handleDefineFont: function(){
                var id = s.readUI16(),
                    numGlyphs = s.readUI16() / 2;
                s.seek(numGlyphs * 2 - 2);
                var c = Gordon.styleChangeStates,
                    glyphs = [],
                    i = numGlyphs;
                while(i--){
                    var numFillBits = s.readUB(4),
                        numLineBits = s.readUB(4),
                        x = y = 0,
                        commands = [];
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
                                    commands.push('L', x, -y);
                                }else{
                                    var isVertical = s.readBool();
                                        if(isVertical){
                                        y += s.readSB(numBits);
                                        commands.push('V', -y);
                                    }else{
                                        x += s.readSB(numBits);
                                        commands.push('H', x);
                                    }
                                    }
                            }else{
                                var cx = x + s.readSB(numBits),
                                    cy = y + s.readSB(numBits);
                                x = cx + s.readSB(numBits);
                                y = cy + s.readSB(numBits);
                                commands.push('Q', cx, -cy, x, -y);
                            }
                        }else{
                            var flags = s.readUB(5);
                            if(flags){
                                if(flags & c.MOVE_TO){
                                    var numBits = s.readUB(5);
                                      x = s.readSB(numBits);
                                    y = s.readSB(numBits);
                                    commands.push('M', x, -y);
                                    }
                                  if(flags & c.LEFT_FILL_STYLE || flags & c.RIGHT_FILL_STYLE){ s.readUB(numFillBits); }
                            }
                        }
                    }while(type || flags);
                    s.align();
                    glyphs.push({commands: commands.join(' ')});
                }
                var font = {
                    type: "font",
                    id: "f_" + id,
                    glyphs: glyphs
                };
                this.ondata(font);
                dictionary[id] = font;
                return this;
            },
            
            _handleDefineText: function(){
                var id = s.readUI16(),
                    txt = {
                        type: "text",
                        id: "t_" + id,
                        bounds: s.readRect(),
                        matrix: s.readMatrix(),
                        strings: []
                    },
                    numGlyphBits = s.readUI8(),
                    numAdvBits = s.readUI8(),
                    fontId = fill = null,
                    x = y = size = 0,
                    str = null,
                    strings = txt.strings;
                do{
                    var hdr = s.readUB(8);
                    if(hdr){
                        var type = hdr >> 7;
                        if(type){
                            var flags = hdr & 0x0f;
                            if(flags){
                                var f = Gordon.textStyleFlags;
                                if(flags & f.HAS_FONT){ fontId = s.readUI16(); }
                                if(flags & f.HAS_COLOR){ fill = s.readRGB(); }
                                if(flags & f.HAS_XOFFSET){ x = twips2px(s.readSI16()); }
                                if(flags & f.HAS_YOFFSET){ y = twips2px(s.readSI16()); }
                                if(flags & f.HAS_FONT){ size = twips2px(s.readUI16()); }
                            }
                            str = {
                                font: dictionary[fontId].id,
                                fill: fill,
                                x: x,
                                y: y,
                                size: size
                            };
                            strings.push(str);
                        }else{
                            var numGlyphs = hdr & 0x7f,
                                entries = str.entries = [],
                                i = numGlyphs;
                            while(i--){
                                var entry = {};
                                entry.index = s.readUB(numGlyphBits);
                                entry.advance = twips2px(s.readSB(numAdvBits));
                                entries.push(entry);
                            }
                            s.align();
                        }
                    }
                }while(hdr);
                this.ondata(txt);
                dictionary[id] = txt;
                return this;
            },
            
            _handleDoAction: function(){
                currFrame.action = this._readAction();
                return this;
            },
            
            _handleDefineFontInfo: function(){
                var fontId = s.readUI16(),
                    font = dictionary[fontId],
                    f = font.info = {
                        name: s.readString(s.readUI8()),
                        isSmall: s.readBool(3),
                        isShiftJis: s.readBool(),
                        isAnsi: s.readBool(),
                        isItalic: s.readBool(),
                        isBold: s.readBool(),
                        codes: []
                    },
                    useWideCodes = s.readBool(),
                    codes = f.codes,
                    i = font.glyphs.length;
                while(i--){
                    var code = useWideCodes ? s.readUI16() : s.readUI8();
                    codes.push(code);
                }
                this.ondata(font);
                dictionary[fontId] = font;
                return this;
            },
            
            _handleDefineBitsJpeg2: function(offset, len){
                return this._handleDefineBits(offset, len, true);
            },
            
            _handleDefineBitsLossless: function(offset, len){
                var id = s.readUI16(),
                    format = s.readUI8(),
                    width = s.readUI16(),
                    height = s.readUI16(),
                    b = Gordon.bitmapFormats;
                if(format == b.COLORMAPPED){ var colorTableSize = s.readUI8(); }
                s.seek(2);
                var d = zip_inflate(s.readString(len - (s.tell() - offset)));
                switch(format){
                    case b.COLORMAPPED:
                        var colorTable = [];
                        for(var i = 0; i <= colorTableSize; i++){ colorTable.push(d.substr(i * 3, 3)); }
                        var data = [];
                        for(var i = 0; i < width * height; i++){ data.push(d[i]); }
                    case b.RGB15:
                    case b.RGB24:
                        var data = [];
                        for(var i = 0; d[i]; i++){ data.push(d[++i], d[++i], d[++i]); }
                        break;
                }
                var img = {
                    type: "image",
                    id: "i_" + id,
                    data: data.join(''),
                    width: width,
                    height: height
                }
                this.ondata(img);
                dictionary[id] = img;
                return this;
            },
            
            _handleDefineShape2: function(){
                return this._handleDefineShape.apply(this, arguments);
            },
            
            _handleDefineButtonCxform: function(){
                var buttonId = s.readUI16(),
                    filterId = "x_" + (++currPrivateId);
                this.ondata({
                    id: filterId,
                    type: "filter",
                    cxform: s.readCxform()
                });
                var button = dictionary[buttonId];
                button.filter = filterId;
                this.ondata(button);
                dictionary[buttonId] = button;
                return this;
            },
            
            _handleProtect: function(offset, len){
                s.seek(len);
                return this;
            }
        };
        
        function cloneEdge(edge){
            with(edge){
                return {i: i, f: f, x1: x1, y1: y1, cx: cx, cy: cy, x2: x2, y2: y2};
            }
        }
        
        function buildShape(edges, fill, stroke){
            var x1 = y1 = x2 = y2 = 0,
                cmds = [];
            edges.forEach(function(edge, i){
                x1 = edge.x1;
                y1 = edge.y1;
                if(x1 != x2 || y1 != y2 || !i){ cmds.push('M', x1, y1); }
                x2 = edge.x2;
                y2 = edge.y2;
                if(null == edge.cx || null == edge.cy){
                    if(x2 == x1){ cmds.push('V', y2); }
                    else if(y2 == y1){ cmds.push('H', x2); }
                    else{ cmds.push('L', x2,  y2); }
                }else{ cmds.push('Q', edge.cx, edge.cy, x2, y2); }
            });
            return {
                type: "shape",
                commands: cmds.join(' '),
                fill: fill,
                stroke: stroke
            };
        }
        
        function calcPointKey(x, y){
            return (x + 50000) * 100000 + y;
        }
        
        var B64_DIGITS = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";
        
        function encodeBase64(data, callback, n){
            var byteNum = 0,
                bits = prevBits = null;
            chars = [];
            for(var i = 0; data[i]; i++){
                byteNum = i % 3;
                bits = data.charCodeAt(i) & 0xff;
                switch(byteNum){
                    case 0:
                        chars.push(B64_DIGITS[bits >> 2]);
                        break;
                    case 1:
                        chars.push(B64_DIGITS[((prevBits & 3) << 4) | (bits >> 4)]);
                        break;
                    case 2:
                        chars.push(B64_DIGITS[((prevBits & 0x0f) << 2) | (bits >> 6)], B64_DIGITS[bits & 0x3f]);
                        break;
                }
                prevBits = bits;
            }
            if(!byteNum){ chars.push(B64_DIGITS[(prevBits & 3) << 4], "=="); }
            else if (byteNum == 1){ chars.push(B64_DIGITS[(prevBits & 0x0f) << 2], '='); }
            return chars.join('');
        }
        
        global.onmessage = function(e){
            new Gordon.Parser(e.data);
        };
    }
}());
