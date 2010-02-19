(function(){
    var NS_SVG = "http://www.w3.org/2000/svg";
    var NS_XLINK = "http://www.w3.org/1999/xlink";
    
    var b = Gordon.buttonStates;
    var buttonStates = {};
    for(var state in b){ buttonStates[b[state]] = state.toLowerCase(); }
    var buttonMask = 0;
    
    Gordon.SvgRenderer = function(width, height, viewWidth, viewHeight, quality, scale, bgcolor){
        var t = this;
        t.width = width;
        t.height = height;
        t.viewWidth = viewWidth;
        t.viewHeight = viewHeight;
        t.quality = quality || Gordon.qualityValues.HIGH;
        t.scale = scale || Gordon.scaleValues.SHOW_ALL;
        t.bgcolor = bgcolor;
        var n = t._node = t._createElement("svg");
            attr = {
                width: width,
                height: height
            };
        if(viewWidth && viewHeight && (width != viewWidth || height != viewHeight)){
            var viewBox = [0, 0, viewWidth, viewHeight];
            attr.viewBox = viewBox.toString();
            if(scale == Gordon.scaleValues.EXACT_FIT){ attr.preserveAspectRatio = "none"; }
        }
        t._setAttributes(n, attr);
        t._defs = n.appendChild(t._createElement("defs"));
        t._stage = n.appendChild(t._createElement('g'));
        t.setQuality(t.quality);
        if(bgcolor){ t.setBgcolor(bgcolor); }
        t._dictionary = {};
        t._displayList = {};
        t._eventTarget = null;
    };
    Gordon.SvgRenderer.prototype = {        
        _createElement: function(name){
            return doc.createElementNS(NS_SVG, name);
        },
        
        _setAttributes: function(node, attr, ns){
            for(var name in attr){
                var val = attr[name];
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
                    var attr = {
                        shape_rendering: "crispEdges",
                        image_rendering: "optimizeSpeed",
                        text_rendering: "optimizeSpeed",
                        color_rendering: "optimizeSpeed"
                    }
                    break;
                case q.AUTO_LOW:
                case q.AUTO_HIGH:
                    var attr = {
                        shape_rendering: "auto",
                        image_rendering: "auto",
                        text_rendering: "auto",
                        color_rendering: "auto"
                    }
                    break;
                case q.MEDIUM:
                    var attr = {
                        shape_rendering: "optimizeSpeed",
                        image_rendering: "optimizeSpeed",
                        text_rendering: "optimizeLegibility",
                        color_rendering: "optimizeSpeed"
                    }
                    break;
                case q.HIGH:
                    var attr = {
                        shape_rendering: "geometricPrecision",
                        image_rendering: "auto",
                        text_rendering: "geometricPrecision",
                        color_rendering: "optimizeQuality"
                    }
                    break;
                case q.BEST:
                    var attr = {
                        shape_rendering: "geometricPrecision",
                        image_rendering: "optimizeQuality",
                        text_rendering: "geometricPrecision",
                        color_rendering: "optimizeQuality"
                    }
                    break;
            }
            t._setAttributes(t._stage, attr);
            t.quality = quality;
            return t;
        },
        
        getNode: function(){
            return this._node;
        },
        
        setBgcolor: function(rgb){
            var t = this;
            if(!t.bgcolor){
                t._node.style.background = color2string(rgb);
                t.bgcolor = rgb;
            }
            return t;
        },
        
        defineObject: function(obj){
            var type = obj.type,
                t = this,
                node = null,
                id = obj.id,
                attr = {id: id},
                d = t._dictionary;
                item = d[id];
            if(!item || !item.node){
                switch(type){
                    case "shape":
                        var s = obj.segments;
                        if(s){
                            var node = t._createElement('g');
                            s.forEach(function(segment){
                                node.appendChild(t._buildShape(segment));
                            });
                        }else{ var node = t._buildShape(obj); }
                        break;
                    case "image":
                        var node = t._createElement("image"),
                            width = obj.width,
                            height = obj.height;
                        if(obj.data){
                            var s = new Gordon.Stream(obj.data),
                                dataSize = width * height * 4,
                                canvas = doc.createElement("canvas");
                            canvas.width = width;
                            canvas.height = height;
                            var ctx = canvas.getContext("2d"),
                                imgData = ctx.createImageData(width, height),
                                data = imgData.data;
                            for(var i = 0; i < dataSize; i += 4){
                                data[i] = s.readUI8();
                                data[i + 1] = s.readUI8();
                                data[i + 2] = s.readUI8();
                                data[i + 3] = 255;
                            }
                            ctx.putImageData(imgData, 0, 0);
                            var uri = canvas.toDataURL();
                        }else{ var uri = obj.uri; }
                        t._setAttributes(node, {href: uri}, NS_XLINK);
                        attr.width = width;
                        attr.height = height;
                        break;
                    case "button":
                        var node = t._createElement('g'),
                            activeArea = t._createElement('g'),
                            s = obj.states;
                        for(var state in s){
                            var display = state == b.HIT ? activeArea : node.appendChild(t._createElement('g'));
                            t._setAttributes(display, {
                                className: buttonStates[state],
                                opacity: state == b.UP ? 1 : 0
                            });
                            var filter = obj.filter,
                                list = states[state];
                            for(var depth in list){
                                if(filter){
                                    var character = cloneCharacter(list[depth]);
                                    character.filter = filter;
                                }else{ var character = list[depth]; }
                                display.appendChild(t._buildCharacter(character));
                            }
                        }
                        node.appendChild(activeArea);
                        break;
                    case "font":
                        var info = obj.info;
                        if(info){
                            var node = t._createElement("font"),
                                faceNode = node.appendChild(t._createElement("font-face"));
                            t._setAttributes(faceNode, {font_family: info.name});
                            var glyphs = obj.glyphs,
                                codes = info.codes;
                            glyphs.forEach(function(glyph, i){
                                var glyphNode = node.appendChild(t._createElement("glyph"));
                                t._setAttributes(glyphNode, {
                                    unicode: String.fromCharCode(codes[i]),
                                    d: glyph.commands
                                });
                            });
                        }
                        break;
                    case "text":
                        var node = t._createElement('g'),
                            s = obj.strings;
                        s.forEach(function(string){
                            var textNode = node.appendChild(t._createElement("text")),
                                entries = string.entries,
                                advances = [],
                                font = t._dictionary[string.font].object,
                                info = font.info,
                                codes = info.codes,
                                characters = [],
                                x = string.x;
                            entries.forEach(function(entry){
                                advances.push(x);
                                characters.push(String.fromCharCode(codes[entry.index]));
                                x += entry.advance;
                            });
                            t._setAttributes(textNode, {
                                font_family: info.name,
                                font_size: string.size,
                                fill: color2string(string.fill),
                                x: advances.join(' '),
                                y: string.y
                            });
                            textNode.appendChild(doc.createTextNode(characters.join('')));
                        });
                        attr.transform = matrix2string(obj.matrix);
                        break;
                    case "filter":
                        var node = t._createElement("filter"),
                            cxform = obj.cxform;
                        if(cxform){
                            var feNode = node.appendChild(t._createElement("feColorMatrix"));
                            t._setAttributes(feNode, {
                                type: "matrix",
                                values: cxform2string(cxform)
                            });
                        }
                        break;
                }
                if(node){
                    t._setAttributes(node, attr);
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
            var t = this,
                node = t._createElement("path"),
                fill = shape.fill,
                stroke = shape.stroke,
                attr = {d: shape.commands};
            if(fill){
                var type = fill.type;
                if(fill.type){
                    var fillNode = t._defs.appendChild(t._buildFill(fill)),
                        fillId = type[0] + shape.id.substr(1);
                    t._setAttributes(fillNode, {id: fillId});
                    attr.fill = "url(#" + fillId + ')';
                }else{ attr.fill = color2string(fill); }
                attr.fill_rule = "evenodd";
            }else{ attr.fill = "none"; }
            if(stroke){
                attr.stroke = color2string(stroke.color);
                attr.stroke_width = Math.max(stroke.width, 1);
                attr.stroke_linecap = attr.stroke_linejoin = "round";
            }
            t._setAttributes(node, attr);
            return node;
        },
        
        _buildFill: function(fill){
            var type = fill.type,
                t = this,
                attr = {};
            switch(type){
                case "linear":
                case "radial":
                    var node = t._createElement(type + "Gradient");
                    attr.gradientUnits = "userSpaceOnUse";
                    attr.gradientTransform = matrix2string(fill.matrix);
                    if("linear" == type){ 
                        attr.x1 = -819.2;
                        attr.x2 = 819.2;
                    }else{
                        attr.cx = attr.cy = 0;
                        attr.r = 819.2;
                    }
                    var s = Gordon.spreadModes;
                    switch(fill.spread){
                        case s.REFLECT:
                            attr.spreadMethod = "reflect";
                            break;
                        case s.REPEAT:
                            attr.spreadMethod = "repeat";
                            break;
                    }
                    var i = Gordon.interpolationModes;
                    if(fill.interpolation == i.LINEAR_RGB){ attr.color_interpolation = "linearRGB"; }
                    var stops = fill.stops;
                    stops.forEach(function(stop){
                        var stopNode = node.appendChild(t._createElement("stop"));
                        t._setAttributes(stopNode, {
                            offset: stop.offset,
                            stop_color: color2string(stop.color)
                        });
                    });
                    break;
                case "pattern":
                    var node = t._createElement("pattern"),
                        useNode = node.appendChild(t._createElement("use")),
                        img = fill.image;
                    t._setAttributes(useNode, {href: "#" + img.id}, NS_XLINK);
                    attr.patternUnits = "userSpaceOnUse";
                    attr.patternTransform = matrix2string(fill.matrix);
                    attr.width = img.width;
                    attr.height = img.height;
                    break;
            }
            t._setAttributes(node, attr);
            return node;
        },
        
        placeCharacter: function(character){
            var depth = character.depth,
                t = this,
                d = t._displayList,
                replace = d[depth];
            if(!replace || replace.character !== character){
                var node = t._buildCharacter(character),
                    s = t._stage;
                if(replace && replace.character !== character){ t.removeCharacter(depth); }
                if(1 == depth){ s.insertBefore(node, s.firstChild); }
                else{
                    var nextDepth = 0;
                    for(var entry in d){
                        if(entry > depth){
                            nextDepth = entry;
                            break;
                        }
                    }
                    if(nextDepth){ s.insertBefore(node, d[nextDepth].node); }
                    else{ s.appendChild(node); }
                }
                d[depth] = {
                    character: character,
                    node: node
                };
            }
            return t;
        },
        
        _buildCharacter: function(character){
            var t = this,
                d = t._dictionary,
                item = d[character.object],
                obj = item.object,
                type = obj.type;
            switch(type){
                case "button":
                    var node = item.node.cloneNode(true),
                        displayMap = {};
                    for(var s in buttonStates){ displayMap[s] = node.getElementsByClassName(buttonStates[s])[0]; }
                    var m = Gordon.mouseButtons,
                        isMouseOver = false;
                    var mouseupHandle = function(e){
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
                    with(displayMap[b.HIT]){
                        onmouseover = function(e){
                            isMouseOver = true;
                            if(!t.eventTarget){
                                if(buttonMask & m.LEFT){ this.onmousedown(e); }
                                else{ setState(b.OVER); }
                            }
                            return false;
                        };
                        onmouseout = function(e){
                            isMouseOver = false;
                            if(!t.eventTarget){ setState(this == t.eventTarget ? b.OVER : b.UP); }
                            return false;
                        };
                        onmousedown = function(e){
                            if(buttonMask & m.LEFT){
                                setState(b.DOWN);
                                doc.addEventListener("mouseup", mouseupHandle, false);
                                t.eventTarget = this;
                            }
                            return false;
                        };
                        onmouseup = function(e){
                            setState(b.OVER);
                            return false;
                        };
                    }
                    var currState = b.UP,
                        setState = function(state){
                            t._setAttributes(displayMap[currState], {opacity: 0});
                            t._setAttributes(displayMap[state], {opacity: 1});
                            currState = state;
                        };
                    break;
                default:
                    var node = t._createElement("use");
                    t._setAttributes(node, {href: "#" + obj.id}, NS_XLINK);
            }
            var filter = character.filter;
            if(filter){ t._setAttributes(node, {filter: "url(#" + filter + ')'}); }
            t._setAttributes(node, {transform: matrix2string(character.matrix)});
            return node;
        },
        
        removeCharacter: function(depth){
            var d = this._displayList,
                node = d[depth].node;
            node.parentNode.removeChild(node);
            delete d[depth];
            return this;
        }
    };
    
    function color2string(color){
        if("string" == typeof color){ return /^([0-9a-z]{1,2}){3}$/i.test(color) ? color : null; }
        with(color){
            return "rgb(" + [red, green, blue] + ')';
        }
    }
    
    function matrix2string(matrix){
        with(matrix){
            return "matrix(" + [scaleX, skewX, skewY, scaleY, moveX, moveY] + ')';
        }
    }
    
    function cxform2string(cxform){
        with(cxform){
            return [multR, 0, 0, 0, addR, 0, multG, 0, 0, addG, 0, 0, multB, 0, addB, 0, 0, 0, multA, addA].toString();
        }
    }
    
    function cloneCharacter(character){
        with(character){
            return {
                object: object,
                depth: depth,
                matrix: matrix,
                cxform: character.cxform
            };
        }
    }
    
    if(doc){
        doc.addEventListener("mousedown", function(e){
            buttonMask |= e.button;
        }, true);
        doc.addEventListener("mouseup", function(e){
            buttonMask ^= e.button;
        }, true);
    }
}());
