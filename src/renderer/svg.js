(function(){
    var NS_SVG = "http://www.w3.org/2000/svg",
        NS_XLINK = "http://www.w3.org/1999/xlink",
        NS_XHTML = "http://www.w3.org/1999/xhtml",
        b = Gordon.buttonStates,
        buttonStates = {},
        buttonMask = 0;
    for(var state in b){ buttonStates[b[state]] = state.toLowerCase(); }
    
    Gordon.SvgRenderer = function(width, height, viewWidth, viewHeight, quality, scale, bgcolor){
        var t = this,
            n = t.node = t._createElement("svg"),
            attrs = {
                width: width,
                height: height
            };
        t.width = width;
        t.height = height;
        t.viewWidth = viewWidth;
        t.viewHeight = viewHeight;
        t.quality = quality || Gordon.qualityValues.HIGH;
        t.scale = scale || Gordon.scaleValues.SHOW_ALL;
        t.bgcolor = bgcolor;
        if(viewWidth && viewHeight && (width != viewWidth || height != viewHeight)){
            attrs.viewBox = [0, 0, viewWidth, viewHeight] + '';
            if(scale == Gordon.scaleValues.EXACT_FIT){ attrs.preserveAspectRatio = "none"; }
        }
        t._setAttributes(n, attrs);
        t._defs = n.appendChild(t._createElement("defs"));
        var s = t._stage = n.appendChild(t._createElement('g'));
        t._setAttributes(s, {
            "fill-rule": "evenodd",
            "stroke-linecap": "round",
            "stroke-linejoin": "round"
        });
        t.setQuality(t.quality);
        if(bgcolor){ t.setBgcolor(bgcolor); }
        t._dictionary = {};
        t._fills = {};
        t._cast = {};
        t._timeline = [];
        t._displayList = {};
        t._eventTarget = null;
    };
    Gordon.SvgRenderer.prototype = {
        _createElement: function(name){
            return doc.createElementNS(NS_SVG, name);
        },
        
        _setAttributes: function(node, attrs, ns){
            for(var name in attrs){
                if(ns){ node.setAttributeNS(ns, name, attrs[name]); }
                else{ node.setAttribute(name, attrs[name]); }
            }
            return node;
        },
        
        setQuality: function(quality){
            var q = Gordon.qualityValues,
                t = this;
            switch(quality){
                case q.LOW:
                    var attrs = {
                        "shape-rendering": "crispEdges",
                        "image-rendering": "optimizeSpeed",
                        "text-rendering": "optimizeSpeed",
                        "color-rendering": "optimizeSpeed"
                    }
                    break;
                case q.AUTO_LOW:
                case q.AUTO_HIGH:
                    var attrs = {
                        "shape-rendering": "auto",
                        "image-rendering": "auto",
                        "text-rendering": "auto",
                        "color-rendering": "auto"
                    }
                    break;
                case q.MEDIUM:
                    var attrs = {
                        "shape-rendering": "optimizeSpeed",
                        "image-rendering": "optimizeSpeed",
                        "text-rendering": "optimizeLegibility",
                        "color-rendering": "optimizeSpeed"
                    }
                    break;
                case q.HIGH:
                    var attrs = {
                        "shape-rendering": "geometricPrecision",
                        "image-rendering": "auto",
                        "text-rendering": "geometricPrecision",
                        "color-rendering": "optimizeQuality"
                    }
                    break;
                case q.BEST:
                    var attrs = {
                        "shape-rendering": "geometricPrecision",
                        "image-rendering": "optimizeQuality",
                        "text-rendering": "geometricPrecision",
                        "color-rendering": "optimizeQuality"
                    }
                    break;
            }
            t._setAttributes(t._stage, attrs);
            t.quality = quality;
            return t;
        },
        
        setBgcolor: function(rgb){
            var t = this;
            if(!t.bgcolor){
                t.node.style.background = color2string(rgb);
                t.bgcolor = rgb;
            }
            return t;
        },
        
        define: function(obj){
            var id = obj.id,
                t = this,
                d = t._dictionary,
                item = d[id],
                type = obj.type,
                node = null,
                attrs = {id: type[0] + id};
            if(!item || !item.node){
                switch(type){
                    case "shape":
                        var segments = obj.segments;
                        if(segments){
                            var node = t._createElement('g'),
                                frgmt = doc.createDocumentFragment();
                            for(var i = 0, seg = segments[0]; seg; seg = segments[++i]){
                                var segNode = frgmt.appendChild(t._buildShape(seg));
                                t._setAttributes(segNode, {id: 's' + seg.id})
                            }
                            node.appendChild(frgmt);
                        }else{ var node = t._buildShape(obj); }
                        break;
                    case "image":
                        var node = t._createElement("image"),
                            colorData = obj.colorData,
                            width = obj.width,
                            height = obj.height;
                        if(colorData){
                            var colorTableSize = obj.colorTableSize || 0,
                                bpp = (obj.withAlpha ? 4 : 3),
                                cmIdx = colorTableSize * bpp,
                                data = (new Gordon.Stream(colorData)).unzip(true),
                                withAlpha = obj.withAlpha,
                                pxIdx = 0,
                                canvas = doc.createElement("canvas"),
                                ctx = canvas.getContext("2d"),
                                imgData = ctx.getImageData(0, 0, width, height),
                                pxData = imgData.data,
                                pad = colorTableSize ? ((width + 3) & ~3) - width : 0
                            canvas.width = width;
                            canvas.height = height;
                            for(var y = 0; y < height; y++){
                                for(var x = 0; x < width; x++){
                                    var idx = (colorTableSize ? data[cmIdx++] : cmIdx) * bpp,
                                        alpha = withAlpha ? data[cmIdx + 3] : 255;
                                    if(alpha){
                                        pxData[pxIdx] = data[idx];
                                        pxData[pxIdx + 1] = data[idx + 1];
                                        pxData[pxIdx + 2] = data[idx + 2];
                                        pxData[pxIdx + 3] = alpha;
                                    }
                                    pxIdx += 4;
                                }
                                cmIdx += pad;
                            }
                            ctx.putImageData(imgData, 0, 0);
                            var uri = canvas.toDataURL();
                        }else{
                            var alphaData = obj.alphaData,
                                uri = "data:image/jpeg;base64," + btoa(obj.data);
                            if(alphaData){
                                var data = (new Gordon.Stream(alphaData)).unzip(true),
                                    img = new Image(),
                                    canvas = doc.createElement("canvas"),
                                    ctx = canvas.getContext("2d");
                                img.src = uri;
                                canvas.width = width;
                                canvas.height = height;
                                ctx.drawImage(img, 0, 0);
                                var len = width * height;
                                    imgData = ctx.getImageData(0, 0, width, height),
                                    pxData = imgData.data,
                                    pxIdx = 0;
                                for(var i = 0; i < len; i++){
                                    pxData[pxIdx + 3] = data[i];
                                    pxIdx += 4;
                                }
                                ctx.putImageData(imgData, 0, 0);
                                uri = canvas.toDataURL();
                            }
                        }
                        t._setAttributes(node, {href: uri}, NS_XLINK);
                        attrs.width = width;
                        attrs.height = height;
                        break;
                    case "button":
                        var node = t._createElement('g'),
                            frgmt = doc.createDocumentFragment(),
                            hitNode = frgmt.appendChild(t._createElement('g')),
                            states = obj.states;
                        for(var state in states){
                            var stateNode = state == b.HIT ? hitNode : frgmt.insertBefore(t._createElement('g'), hitNode),
                                list = states[state],
                                cxform = obj.cxform;
                            t._setAttributes(stateNode, {
                                className: buttonStates[state],
                                opacity: state == b.UP ? 1 : 0
                            });
                            for(var depth in list){
                                if(cxform){
                                    var character = cloneCharacter(list[depth]);
                                    character.cxform = cxform;
                                }else{ var character = list[depth]; }
                                stateNode.appendChild(t._buildCharacter(character));
                            }
                        }
                        node.appendChild(frgmt);
                        break;
                    case "font":
                        var info = obj.info;
                        if(info){
                            var node = t._createElement("font"),
                                faceNode = node.appendChild(t._createElement("font-face")),
                                advanceTable = info.advanceTable
                                glyphs = obj.glyphs,
                                codes = info.codes,
                                frgmt = doc.createDocumentFragment(),
                                kerningTable = info.kerningTable;
                            t._setAttributes(faceNode, {
                                "font-family": id,
                                "units-per-em": 20480,
                                ascent: info.ascent || 20480,
                                descent: info.ascent || 20480,
                                "horiz-adv-x": advanceTable ? '' + advanceTable : 20480
                            });
                            for(var i = 0, glyph = glyphs[0]; glyph; glyph = glyphs[++i]){
                                var cmds = glyph.commands,
                                    code = codes[i];
                                if(cmds && code){
                                    var glyphNode = frgmt.appendChild(t._createElement("glyph"));
                                    t._setAttributes(glyphNode, {
                                        unicode: String.fromCharCode(code),
                                        d: glyph.commands
                                    });
                                }
                            }
                            if(kerningTable){
                                for(var i = 0, kern = kerningTable[0]; kern; kern = kerningTable[++i]){
                                    var kernNode = frgmt.appendChild(t._createElement("hkern"));
                                    t._setAttributes(kernNode, {
                                        g1: kern.code1,
                                        g2: kern.code2,
                                        k: kern.adjustment
                                    });
                                }
                            }
                            node.appendChild(frgmt);
                        }
                        break;
                    case "text":
                        var frgmt = doc.createDocumentFragment(),
                            strings = obj.strings;
                        for(var i = 0, string = strings[0]; string; string = strings[++i]){
                            var txtNode = frgmt.appendChild(t._createElement("text")),
                                entries = string.entries,
                                font = t._dictionary[string.font].object,
                                info = font.info,
                                codes = info.codes,
                                advances = [],
                                chars = [];
                                x = string.x,
                                y = string.y * -1;
                            for(var j = 0, entry = entries[0]; entry; entry = entries[++j]){
                                var str = String.fromCharCode(codes[entry.index]);
                                if(str != ' ' || chars.length){
                                    advances.push(x);
                                    chars.push(str);
                                }
                                x += entry.advance;
                            }
                            t._setAttributes(txtNode, {
                                id: 't' + id + '-' + (i + 1),
                                "font-family": font.id,
                                "font-size": string.size * 20,
                                x: advances.join(' '),
                                y: y
                            });
                            txtNode.appendChild(doc.createTextNode(chars.join('')));
                        }
                        if(strings.length > 1){
                            var node = t._createElement('g');
                            node.appendChild(frgmt);
                        }else{ var node = frgmt.firstChild; }
                        break;
                }
                if(node){
                    t._setAttributes(node, attrs);
                    t._defs.appendChild(node);
                }
                d[id] = {
                    object: obj,
                    node: node
                }
            }else{ d[id].object = obj; }
            return t;
        },
        
        _buildShape: function(shape){
            var fill = shape.fill,
                t = this;
            if(fill && "pattern" == fill.type && !fill.repeat){
                var node = t._createElement("use"),
                    img = fill.image;
                t._setAttributes(node, {href: "#" + img.id}, NS_XLINK);
                t._setAttributes(node, {transform: matrix2string(fill.matrix)});
            }else{
                var node = t._createElement("path");
                t._setAttributes(node, {d: shape.commands});
            }
            return node;
        },
        
        frame: function(frm){
            var bgcolor = frm.bgcolor,
                t = this,
                d = frm.displayList;
            if(bgcolor && !t.bgcolor){
                t.setBgcolor(bgcolor);
                t.bgcolor = bgcolor;
            }
            for(depth in d){
                var character = d[depth];
                if(character){
                    var objId = character.object || t._displayList[depth].character.object;
                    if(objId){
                        if(character.clipDepth){
                            var cpNode = t._defs.appendChild(t._createElement("clipPath")),
                                useNode = cpNode.appendChild(t._createElement("use")),
                                matrix = character.matrix;
                            t._setAttributes(useNode, {id: 'p' + objId});
                            t._setAttributes(useNode, {href: '#s' + objId}, NS_XLINK);
                            if(matrix){ t._setAttributes(useNode, {transform: matrix2string(matrix)}); }
                        }
                        var cxform = character.cxform,
                            characterId = character._id = objectId({
                                object: objId,
                                cxform: cxform
                            }),
                            c = t._cast[characterId],
                            node = c ? c.node : t._prepare(t._dictionary[objId].object, cxform);
                        t._setAttributes(node, {id: 'c' + characterId});
                        t._defs.appendChild(node);
                    }
                    t._cast[characterId] = {
                        character: character,
                        node: node
                    };
                }
            }
            t._timeline.push(frm);
            return t;
        },
        
        _prepare: function(obj, cxform){
            var type = obj.type,
                t = this,
                node = null,
                id = obj.id,
                attrs = {};
            switch(type){
                case "shape":
                    var segments = obj.segments;
                    if(segments){
                        var node = t._createElement('g'),
                            frgmt = doc.createDocumentFragment();
                        for(var i = 0, seg = segments[0]; seg; seg = segments[++i]){
                            frgmt.appendChild(t._prepare(seg, cxform));
                        }
                        node.appendChild(frgmt);
                    }else{
                        var node = t._createElement("use");
                        t._setAttributes(node, {href: '#s' + id}, NS_XLINK);
                        t._setStyle(node, obj.fill, obj.line, cxform);
                    }
                    break;
                case "text":
                    var strings = obj.strings,
                        frgmt = doc.createDocumentFragment(),
                        matrix = cloneMatrix(obj.matrix);
                    for(var i = 0, string = strings[0]; string; string = strings[++i]){
                        var useNode = frgmt.appendChild(t._createElement("use"));
                        t._setAttributes(useNode, {href: '#t' + id + '-' + (i + 1)}, NS_XLINK);
                        t._setStyle(useNode, string.fill, null, cxform);
                    }
                    if(strings.length > 1){
                        var node = t._createElement('g');
                        node.appendChild(frgmt);
                    }else{ var node = frgmt.firstChild; }
                    matrix.scaleY *= -1;
                    attrs.transform = matrix2string(matrix);
                    break;
            }
            if(node){ t._setAttributes(node, attrs); }
            return node;
        },
        
        _setStyle: function(node, fill, line, cxform){
            var t = this,
                attrs = {};
            if(fill){
                var type = fill.type;
                if(fill.type){
                    objectId(fill);
                    var fillNode = t._defs.appendChild(t._buildFill(fill, cxform));
                    attrs.fill = "url(#" + fillNode.id + ')';
                }else{
                    var color = cxform ? transformColor(fill, cxform) : fill,
                        alpha = color.alpha;
                    attrs.fill = color2string(color);
                    if(undefined != alpha && alpha < 1){ attrs["fill-opacity"] = alpha; }
                }
            }else{ attrs.fill = "none"; }
            if(line){
                var color = cxform ? transformColor(line.color, cxform) : line.color,
                    alpha = color.alpha;
                attrs.stroke = color2string(color);
                attrs["stroke-width"] = Math.max(line.width, 1);
                if(undefined != alpha && alpha < 1){ attr["stroke-opacity"] = alpha; }
            }
            t._setAttributes(node, attrs);
            return t;
        },
        
        _buildFill: function(fill, cxform){
            var t = this,
                f = t._fills,
                id = objectId(fill),
                node = f[id];
            if(!node){
                var type = fill.type,
                    attrs = {id: type[0] + id};
                switch(type){
                    case "linear":
                    case "radial":
                        var node = t._createElement(type + "Gradient"),
                            s = Gordon.spreadModes,
                            i = Gordon.interpolationModes,
                            stops = fill.stops;
                        attrs.gradientUnits = "userSpaceOnUse";
                        attrs.gradientTransform = matrix2string(fill.matrix);
                        if("linear" == type){ 
                            attrs.x1 = -819.2;
                            attrs.x2 = 819.2;
                        }else{
                            attrs.cx = attrs.cy = 0;
                            attrs.r = 819.2;
                        }
                        switch(fill.spread){
                            case s.REFLECT:
                                attrs.spreadMethod = "reflect";
                                break;
                            case s.REPEAT:
                                attrs.spreadMethod = "repeat";
                                break;
                        }
                        if(fill.interpolation == i.LINEAR_RGB){ attrs["color-interpolation"] = "linearRGB"; }
                        stops.forEach(function(stop){
                            var stopNode = node.appendChild(t._createElement("stop")),
                                color = cxform ? transformColor(stop.color, cxform) : stop.color,
                                alpha = color.alpha;
                            t._setAttributes(stopNode, {
                                offset: stop.offset,
                                "stop-color": color2string(color),
                                "stop-opacity": alpha == undefined ? 1 : alpha / 255
                            });
                        });
                        break;
                    case "pattern":
                        var node = t._createElement("pattern");
                        if(cxform){
                            var canvas = doc.createElement("canvas"),
                                img = doc.getElementById('i' + obj.image.id),
                                width = img.width,
                                height = img.height,
                                ctx = canvas.getContext("2d");
                            canvas.width = width;
                            canvas.height = height;
                            ctx.drawImage(img, 0, 0);
                            var imgData = ctx.getImageData(0, 0, width, height),
                                pxData = imgData.data,
                                multR = cxform.multR,
                                multG = cxform.multG,
                                multB = cxform.multB,
                                multA = cxform.multA,
                                addR = cxform.addR,
                                addG = cxform.addG,
                                addB = cxform.addB,
                                addA = cxform.addA;
                            for(var i = 0; undefined != pxData[i]; i+= 4){
                                pxData[i] = ~~Math.max(0, Math.min((pxData[i] * multR) + addR, 255));
                                pxData[i + 1] = ~~Math.max(0, Math.min((pxData[i + 1] * multG) + addG, 255));
                                pxData[i + 2] = ~~Math.max(0, Math.min((pxData[i + 2] * multB) + addB, 255));
                                pxData[i + 3] = ~~Math.max(0, Math.min((pxData[i + 3] * multA) + addA, 255));
                            }
                            var imgNode = node.appendChild(t._createElement("image"));
                            t._setAttributes(imgNode, {href: canvas.toDataURL()}, NS_XLINK);
                            t._setAttributes(imgNode, {
                                width: width,
                                height: height
                            });
                        }else{
                            var useNode = node.appendChild(t._createElement("use")),
                                img = fill.image;
                            t._setAttributes(useNode, {href: "#i" + img.id}, NS_XLINK);
                        }
                        attrs.patternUnits = "userSpaceOnUse";
                        attrs.patternTransform = matrix2string(fill.matrix);
                        attrs.width = img.width;
                        attrs.height = img.height;
                        break;
                }
                t._setAttributes(node, attrs);
                t._fills[id] = node;
            }
            return node;
        },
        
        show: function(frmIdx){
            var t = this,
                frm = t._timeline[frmIdx],
                d = frm.displayList;
            for(var depth in d){
                var character = d[depth];
                if(character){ t.place(character); }
                else{ t.remove(depth); }
            }
            return t;
        },
        
        place: function(character){
            var depth = character.depth,
                t = this,
                d = t._displayList,
                replace = d[depth];
            if(replace && !character.object){ var node = replace.node; }
            else{
                var node = t._buildCharacter(character),
                    stage = t._stage;
                if(replace){ t.remove(depth); }
                if(1 == depth){ stage.insertBefore(node, stage.firstChild); }
                else{
                    var nextDepth = 0;
                    for(var entry in d){
                        var c = d[entry].character;
                        if(c.clipDepth && depth <= c.clipDepth){ stage = d[entry].node; }
                        if(entry > depth){
                            nextDepth = entry;
                            break;
                        }
                    }
                    if(nextDepth){ stage.insertBefore(node, d[nextDepth].node); }
                    else{ stage.appendChild(node); }
                }
            }
            if(!character.clipDepth){
                var attrs = {},
                    matrix = character.matrix;
                if(matrix){ attrs.transform = matrix2string(matrix); }
                t._setAttributes(node, {href: "#c" + character._id}, NS_XLINK);
                t._setAttributes(node, attrs);
            }
            d[depth] = {
                character: character,
                node: node
            };
            return t;
        },
        
        _buildCharacter: function(character){
            var t = this;
            if(character.clipDepth){
                var node = t._createElement('g');
                t._setAttributes(node, {"clip-path": "url(#p" + character.object + ')'});
            }else{
                var d = t._dictionary,
                    item = d[character.object],
                    obj = item.object,
                    type = obj.type;
                switch(type){
                    case "button":
                        var node = item.node.cloneNode(true),
                            stateNodes = {},
                            currState = b.UP,
                            m = Gordon.mouseButtons,
                            isMouseOver = false,
                            action = obj.action,
                            trackAsMenu = obj.trackAsMenu;
                        for(var s in buttonStates){ stateNodes[s] = node.getElementsByClassName(buttonStates[s])[0]; }
                        var hitNode = stateNodes[b.HIT];
                        
                        function setState(state){
                            t._setAttributes(stateNodes[currState], {opacity: 0});
                            t._setAttributes(stateNodes[state], {opacity: 1});
                            currState = state;
                        };
                        
                        function mouseupHandle(e){
                            if(!(buttonMask & m.LEFT)){
                                if(isMouseOver){
                                    setState(b.OVER);
                                    if(action){ action(); }
                                }else{ setState(b.UP); }
                                doc.removeEventListener("mouseup", mouseupHandle, false);
                                t.eventTarget = null;
                            }
                            return false;
                        };
                        
                        hitNode.onmouseover = function(e){
                            isMouseOver = true;
                            if(!t.eventTarget){
                                if(buttonMask & m.LEFT){ this.onmousedown(e); }
                                else{ setState(b.OVER); }
                            }
                            return false;
                        };
                        
                        hitNode.onmouseout = function(e){
                            isMouseOver = false;
                            if(!t.eventTarget || trackAsMenu){ setState(b.UP); }
                            return false;
                        };
                        
                        hitNode.onmousedown = function(e){
                            if(buttonMask & m.LEFT){
                                setState(b.DOWN);
                                doc.addEventListener("mouseup", mouseupHandle, false);
                                t.eventTarget = this;
                            }
                            return false;
                        };
                        
                        hitNode.onmouseup = function(e){
                            setState(b.OVER);
                            return false;
                        };
                        break;
                    default:
                        var node = t._createElement("use");
                }
            }
            return node;
        },
        
        remove: function(depth){
            var d = this._displayList,
                item = d[depth],
                node = item.node,
                parentNode = node.parentNode;
            if(item.character.clipDepth){
                var childNodes = node.childNodes;
                for(var c in childNodes){ parentNode.insertBefore(childNodes[c], node); }
            }
            parentNode.removeChild(node);
            delete d[depth];
            return this;
        }
    };
    
    var REGEXP_IS_COLOR = /^([\da-f]{1,2}){3}$/i;
    
    function color2string(color){
        if("string" == typeof color){ return REGEXP_IS_COLOR.test(color) ? color : null; }
        return "rgb(" + [color.red, color.green, color.blue] + ')';
    }
    
    function matrix2string(matrix){
        return "matrix(" + [
            matrix.scaleX, matrix.skewX,
            matrix.skewY, matrix.scaleY,
            matrix.moveX, matrix.moveY
        ] + ')';
    }
    
    function transformColor(color, cxform){
        return {
            red: ~~Math.max(0, Math.min((color.red * cxform.multR) + cxform.addR, 255)),
            green: ~~Math.max(0, Math.min((color.green * cxform.multG) + cxform.addG, 255)),
            blue: ~~Math.max(0, Math.min((color.blue * cxform.multB) + cxform.addB, 255)),
            alpha: ~~Math.max(0, Math.min((color.alpha * cxform.multA) + cxform.addA, 255))
        }
    }
    
    function cloneCharacter(character){
        return {
            object: character.object,
            depth: character.depth,
            matrix: character.matrix,
            cxform: character.cxform
        };
    }
    
    function objectId(object){
        var callee = arguments.callee,
            memo = callee._memo || (callee._memo = {}),
            nextId = (callee._nextId || (callee._nextId = 1)),
            key = JSON.stringify(object),
            origId = memo[key];
        if(!origId){ memo[key] = nextId; }
        return origId || callee._nextId++;
    }
    
    function cloneMatrix(matrix){
        return {
            scaleX: matrix.scaleX, scaleY: matrix.scaleY,
            skewX: matrix.skewX, skewY: matrix.skewY,
            moveX: matrix.moveX, moveY: matrix.moveY
        };
    }
    
    if(doc){
        doc.addEventListener("mousedown", function(e){
            buttonMask |= 0x01 << e.button;
        }, true);
        doc.addEventListener("mouseup", function(e){
            buttonMask ^= 0x01 << e.button;
        }, true);
    }
})();
