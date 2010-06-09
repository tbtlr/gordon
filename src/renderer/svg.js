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
            fill_rule: "evenodd",
            stroke_linecap: "round",
            stroke_linejoin: "round"
        });
        t.setQuality(t.quality);
        if(bgcolor){ t.setBgcolor(bgcolor); }
        t._dictionary = {};
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
                var val = attrs[name];
                name = name == "className" ? "class" : name.replace(/_/g, '-');
                if(ns){ node.setAttributeNS(ns, name, val); }
                else{ node.setAttribute(name, val); }
            }
            return node;
        },
        
        setQuality: function(quality){
            var q = Gordon.qualityValues,
                t = this;
            switch(quality){
                case q.LOW:
                    var attrs = {
                        shape_rendering: "crispEdges",
                        image_rendering: "optimizeSpeed",
                        text_rendering: "optimizeSpeed",
                        color_rendering: "optimizeSpeed"
                    }
                    break;
                case q.AUTO_LOW:
                case q.AUTO_HIGH:
                    var attrs = {
                        shape_rendering: "auto",
                        image_rendering: "auto",
                        text_rendering: "auto",
                        color_rendering: "auto"
                    }
                    break;
                case q.MEDIUM:
                    var attrs = {
                        shape_rendering: "optimizeSpeed",
                        image_rendering: "optimizeSpeed",
                        text_rendering: "optimizeLegibility",
                        color_rendering: "optimizeSpeed"
                    }
                    break;
                case q.HIGH:
                    var attrs = {
                        shape_rendering: "geometricPrecision",
                        image_rendering: "auto",
                        text_rendering: "geometricPrecision",
                        color_rendering: "optimizeQuality"
                    }
                    break;
                case q.BEST:
                    var attrs = {
                        shape_rendering: "geometricPrecision",
                        image_rendering: "optimizeQuality",
                        text_rendering: "geometricPrecision",
                        color_rendering: "optimizeQuality"
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
                attrs = {id: 'o' + id};
            if(!item || !item.node){
                switch(type){
                    case "shape":
                        var segments = obj.segments;
                        if(segments){
                            var node = t._createElement('g');
                            for(var i = 0, seg = segments[0]; seg; seg = segments[++i]){
                                var segNode = node.appendChild(t._buildShape(seg));
                                t._setAttributes(segNode, {id: 's' + seg.id})
                            }
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
                            hitArea = t._createElement('g'),
                            states = obj.states;
                        for(var state in states){
                            var display = state == b.HIT ? hitArea : node.appendChild(t._createElement('g')),
                                list = states[state],
                                cxform = obj.cxform;
                            t._setAttributes(display, {
                                className: buttonStates[state],
                                opacity: state == b.UP ? 1 : 0
                            });
                            for(var depth in list){
                                if(cxform){
                                    var character = cloneCharacter(list[depth]);
                                    character.cxform = cxform;
                                }else{ var character = list[depth]; }
                                display.appendChild(t._buildCharacter(character));
                            }
                        }
                        node.appendChild(hitArea);
                        break;
                    case "font":
                        var info = obj.info;
                        if(info){
                            var node = t._createElement("font"),
                                faceNode = node.appendChild(t._createElement("font-face")),
                                glyphs = obj.glyphs,
                                codes = info.codes,
                                kerningTable = info.kerningTable;
                            t._setAttributes(faceNode, {
                                font_family: id,
                                units_per_em: 20480,
                                ascent: info.ascent || 20480,
                                descent: info.ascent || 20480,
                                horiz_adv_x: '' + info.advanceTable
                            });
                            for(var i = 0, glyph = glyphs[0]; glyph; glyph = glyphs[++i]){
                                var cmds = glyph.commands,
                                    code = codes[i];
                                if(cmds && code){
                                    var glyphNode = node.appendChild(t._createElement("glyph"));
                                    t._setAttributes(glyphNode, {
                                        unicode: String.fromCharCode(code),
                                        d: glyph.commands
                                    });
                                }
                            }
                            attrs.horiz_adv_x = 20480;
                            if(kerningTable){
                                for(var i = 0, kern = kerningTable[0]; kern; kern = kerningTable[++i]){
                                    var kernNode = node.appendChild(t._createElement("hkern"));
                                    t._setAttributes(kernNode, {
                                        g1: kern.code1,
                                        g2: kern.code2,
                                        k: kern.adjustment
                                    });
                                }
                            }
                        }
                        break;
                    case "text":
                        var node = t._createElement('g'),
                            strings = obj.strings,
                            matrix = cloneMatrix(obj.matrix);
                        for(var i = 0, string = strings[0]; string; string = strings[++i]){
                            var txtNode = node.appendChild(t._createElement("text")),
                                entries = string.entries,
                                font = t._dictionary[string.font].object,
                                info = font.info,
                                codes = info.codes,
                                advances = [],
                                chars = [];
                                x = string.x,
                                y = string.y * -1,
                                fill = string.fill,
                                alpha = fill.alpha;
                            for(var j = 0, entry = entries[0]; entry; entry = entries[++j]){
                                var str = String.fromCharCode(codes[entry.index]);
                                if(str != ' ' || chars.length){
                                    advances.push(x);
                                    chars.push(str);
                                }
                                x += entry.advance;
                            }
                            t._setAttributes(txtNode, {
                                font_family: font.id,
                                font_size: string.size * 20,
                                fill: color2string(fill),
                                opacity: undefined == alpha ? 1 : alpha,
                                x: advances.join(' '),
                                y: y
                            });
                            txtNode.appendChild(doc.createTextNode(chars.join('')));
                        }
                        matrix.scaleY *= -1;
                        attrs.transform = matrix2string(matrix);
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
                var node = t._createElement("path"),
                    line = shape.line,
                    attrs = {d: shape.commands};
                if(fill){
                    var type = fill.type;
                    if(fill.type){
                        var fillNode = t._defs.appendChild(t._buildFill(fill)),
                            fillId = type[0] + shape.id;
                        t._setAttributes(fillNode, {id: fillId});
                        attrs.fill = "url(#" + fillId + ')';
                    }else{
                        attrs.fill = color2string(fill);
                        var alpha = fill.alpha;
                        attrs.opacity = alpha == undefined ? 1 : alpha;
                    }
                }else{ attrs.fill = "none"; }
                if(line){
                    attrs.stroke = color2string(line.color);
                    attrs.stroke_width = Math.max(line.width, 1);
                }
                t._setAttributes(node, attrs);
            }
            return node;
        },
        
        _buildFill: function(fill){
            var type = fill.type,
                t = this,
                attrs = {};
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
                    if(fill.interpolation == i.LINEAR_RGB){ attrs.color_interpolation = "linearRGB"; }
                    stops.forEach(function(stop){
                        var stopNode = node.appendChild(t._createElement("stop")),
                            color = stop.color,
                            alpha = color.alpha;
                        t._setAttributes(stopNode, {
                            offset: stop.offset,
                            stop_color: color2string(color),
                            stop_opacity: alpha == undefined ? 1 : alpha
                        });
                    });
                    break;
                case "pattern":
                    var node = t._createElement("pattern"),
                        useNode = node.appendChild(t._createElement("use")),
                        img = fill.image;
                    t._setAttributes(useNode, {href: "#" + img.id}, NS_XLINK);
                    attrs.patternUnits = "userSpaceOnUse";
                    attrs.patternTransform = matrix2string(fill.matrix);
                    attrs.width = img.width;
                    attrs.height = img.height;
                    break;
            }
            t._setAttributes(node, attrs);
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
                    if(character.clipDepth){
                        var cpNode = t._defs.appendChild(t._createElement("clipPath")),
                            useNode = cpNode.appendChild(t._createElement("use")),
                            matrix = character.matrix;
                        t._setAttributes(useNode, {id: '#c' + character.object});
                        t._setAttributes(useNode, {href: '#o' + character.object}, NS_XLINK);
                        if(matrix){ t._setAttributes(useNode, {transform: matrix2string(matrix)}); }
                    }
                    var cxform = character.cxform;
                    if(cxform){
                        
                    }
                }
            }
            t._timeline.push(frm);
            return t;
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
                t._setAttributes(node, {clip_path: "url(#c" + character.object + ')'});
            }else{
                var d = t._dictionary,
                    item = d[character.object],
                    obj = item.object,
                    type = obj.type;
                switch(type){
                    case "button":
                        var node = item.node.cloneNode(true),
                            displayMap = {},
                            currState = b.UP,
                            m = Gordon.mouseButtons,
                            isMouseOver = false,
                            hitArea = displayMap[b.HIT];
                        
                        function setState(state){
                            t._setAttributes(displayMap[currState], {opacity: 0});
                            t._setAttributes(displayMap[state], {opacity: 1});
                            currState = state;
                        };
                        
                        for(var s in buttonStates){ displayMap[s] = node.getElementsByClassName(buttonStates[s])[0]; }
                        
                        function mouseupHandle(e){
                            if(!(buttonMask & m.LEFT)){
                                if(isMouseOver){
                                    setState(b.OVER);
                                    obj.action();
                                }else{ setState(b.UP); }
                                doc.removeEventListener("mouseup", mouseupHandle, false);
                                t.eventTarget = null;
                            }
                            return false;
                        };
                        
                        hitArea.onmouseover = function(e){
                            isMouseOver = true;
                            if(!t.eventTarget){
                                if(buttonMask & m.LEFT){ this.onmousedown(e); }
                                else{ setState(b.OVER); }
                            }
                            return false;
                        };
                        
                        hitArea.onmouseout = function(e){
                            isMouseOver = false;
                            if(!t.eventTarget){ setState(this == t.eventTarget ? b.OVER : b.UP); }
                            return false;
                        };
                        
                        hitArea.onmousedown = function(e){
                            if(buttonMask & m.LEFT){
                                setState(b.DOWN);
                                doc.addEventListener("mouseup", mouseupHandle, false);
                                t.eventTarget = this;
                            }
                            return false;
                        };
                        
                        hitArea.onmouseup = function(e){
                            setState(b.OVER);
                            return false;
                        };
                        break;
                    default:
                        var node = t._createElement("use");
                        t._setAttributes(node, {href: "#o" + obj.id}, NS_XLINK);
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
    
    function cloneCharacter(character){
        return {
            object: character.object,
            depth: character.depth,
            matrix: character.matrix,
            cxform: character.cxform
        };
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
