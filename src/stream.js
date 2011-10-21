(function(){
    var DEFLATE_CODE_LENGTH_ORDER = [16, 17, 18, 0, 8, 7, 9, 6, 10, 5, 11, 4, 12, 3, 13, 2, 14, 1, 15],
        DEFLATE_CODE_LENGHT_MAP = [
            [0, 3], [0, 4], [0, 5], [0, 6], [0, 7], [0, 8], [0, 9], [0, 10], [1, 11], [1, 13], [1, 15], [1, 17],
            [2, 19], [2, 23], [2, 27], [2, 31], [3, 35], [3, 43], [3, 51], [3, 59], [4, 67], [4, 83], [4, 99],
            [4, 115], [5, 131], [5, 163], [5, 195], [5, 227], [0, 258]
        ],
        DEFLATE_DISTANCE_MAP = [
            [0, 1], [0, 2], [0, 3], [0, 4], [1, 5], [1, 7], [2, 9], [2, 13], [3, 17], [3, 25], [4, 33], [4, 49],
            [5, 65], [5, 97], [6, 129], [6, 193], [7, 257], [7, 385], [8, 513], [8, 769], [9, 1025], [9, 1537],
            [10, 2049], [10, 3073], [11, 4097], [11, 6145], [12, 8193], [12, 12289], [13, 16385], [13, 24577]
        ];

    Gordon.Stream = function(data){
        var buff = [],
            t = this,
            i = t.length = data.length;
        t.offset = 0;
        for(var i = 0; data[i]; i++){ buff.push(fromCharCode(data.charCodeAt(i) & 0xff)); }
        t._buffer = buff.join('');
        t._bitBuffer = null;
        t._bitOffset = 8;
    };
    Gordon.Stream.prototype = {
        readByteAt: function(pos){
            return this._buffer.charCodeAt(pos);
        },

        readNumber: function(numBytes, bigEnd){
            var t = this,
                val = 0;
            if(bigEnd){
                while(numBytes--){ val = (val << 8) | t.readByteAt(t.offset++); }
            }else{
                var o = t.offset,
                    i = o + numBytes;
                while(i > o){ val = (val << 8) | t.readByteAt(--i); }
                t.offset += numBytes;
            }
            t.align();
            return val;
        },

        readSNumber: function(numBytes, bigEnd){
            var val = this.readNumber(numBytes, bigEnd),
                numBits = numBytes * 8;
            if(val >> (numBits - 1)){ val -= Math.pow(2, numBits); }
            return val;
        },

        readSI8: function(){
            return this.readSNumber(1);
        },

        readSI16: function(bigEnd){
            return this.readSNumber(2, bigEnd);
        },

        readSI32: function(bigEnd){
            return this.readSNumber(4, bigEnd);
        },

        readUI8: function(){
            return this.readNumber(1);
        },

        readUI16: function(bigEnd){
            return this.readNumber(2, bigEnd);
        },

        readUI24: function(bigEnd){
            return this.readNumber(3, bigEnd);
        },

        readUI32: function(bigEnd){
            return this.readNumber(4, bigEnd);
        },

        readFixed: function(){
            return this._readFixedPoint(32, 16);
        },

        _readFixedPoint: function(numBits, precision){
            return this.readSB(numBits) * Math.pow(2, -precision);
        },

        readFixed8: function(){
            return this._readFixedPoint(16, 8);
        },

        readFloat: function(){
            return this._readFloatingPoint(8, 23);
        },

        _readFloatingPoint: function(numEBits, numSBits){
            var numBits = 1 + numEBits + numSBits,
                numBytes = numBits / 8,
                t = this,
                val = 0.0;
            if(numBytes > 4){
                var i = Math.ceil(numBytes / 4);
                while(i--){
                    var buff = [],
                        o = t.offset,
                        j = o + (numBytes >= 4 ? 4 : numBytes % 4);
                    while(j > o){
                        buff.push(t.readByteAt(--j));
                        numBytes--;
                        t.offset++;
                    }
                }
                var s = new Gordon.Stream(fromCharCode.apply(String, buff)),
                    sign = s.readUB(1),
                    expo = s.readUB(numEBits),
                    mantis = 0,
                    i = numSBits;
                while(i--){
                    if(s.readBool()){ mantis += Math.pow(2, i); }
                }
            }else{
                var sign = t.readUB(1),
                    expo = t.readUB(numEBits),
                    mantis = t.readUB(numSBits);
            }
            if(sign || expo || mantis){
                var maxExpo = Math.pow(2, numEBits),
                    bias = ~~((maxExpo - 1) / 2),
                    scale = Math.pow(2, numSBits),
                    fract = mantis / scale;
                if(bias){
                    if(bias < maxExpo){ val = Math.pow(2, expo - bias) * (1 + fract); }
                    else if(fract){ val = NaN; }
                    else{ val = Infinity; }
                }else if(fract){ val = Math.pow(2, 1 - bias) * fract; }
                if(NaN != val && sign){ val *= -1; }
            }
            return val;
        },

        readFloat16: function(){
            return this._readFloatingPoint(5, 10);
        },

        readDouble: function(){
            return this._readFloatingPoint(11, 52);
        },

        readEncodedU32: function(){
            var val = 0;
            for(var i = 0; i < 5; i++){
                var num = this.readByteAt(this._offset++);
                val = val | ((num & 0x7f) << (7 * i));
                if(!(num & 0x80)){ break; }
            }
            return val;
        },

        readSB: function(numBits){
            var val = this.readUB(numBits);
            if(val >> (numBits - 1)){ val -= Math.pow(2, numBits); }
            return val;
        },

        readUB: function(numBits, lsb){
            var t = this,
                val = 0;
            for(var i = 0; i < numBits; i++){
                if(8 == t._bitOffset){
                    t._bitBuffer = t.readUI8();
                    t._bitOffset = 0;
                }
                if(lsb){ val |= (t._bitBuffer & (0x01 << t._bitOffset++) ? 1 : 0) << i; }
                else{ val = (val << 1) | (t._bitBuffer & (0x80 >> t._bitOffset++) ? 1 : 0); }
            }
            return val;
        },

        readFB: function(numBits){
            return this._readFixedPoint(numBits, 16);
        },

        readString: function(numChars){
            var t = this,
                b = t._buffer;
            if(undefined != numChars){
                var str = b.substr(t.offset, numChars);
                t.offset += numChars;
            }else{
                var chars = [],
                    i = t.length - t.offset;
                while(i--){
                    var code = t.readByteAt(t.offset++);
                    if(code){ chars.push(fromCharCode(code)); }
                    else{ break; }
                }
                var str = chars.join('');
            }
            return str;
        },

        readBool: function(numBits){
            return !!this.readUB(numBits || 1);
        },

        seek: function(offset, absolute){
            var t = this;
            t.offset = (absolute ? 0 : t.offset) + offset;
            t.align();
            return t;
        },

        align: function(){
            this._bitBuffer = null;
            this._bitOffset = 8;
            return this;
        },

        readLanguageCode: function(){
            return this.readUI8();
        },

        readRGB: function(){
            return {
                red: this.readUI8(),
                green: this.readUI8(),
                blue: this.readUI8()
            }
        },

        readRGBA: function(){
            var rgba = this.readRGB();
            rgba.alpha = this.readUI8() / 255;
            return rgba;
        },

        readARGB: function(){
            var alpha = this.readUI8() / 255,
                rgba = this.readRGB();
            rgba.alpha = alpha;
            return rgba;
        },

        readRect: function(){
            var t = this;
                numBits = t.readUB(5),
                rect = {
                    left: t.readSB(numBits),
                    right: t.readSB(numBits),
                    top: t.readSB(numBits),
                    bottom: t.readSB(numBits)
                };
            t.align();
            return rect;
        },

        readMatrix: function(){
            var t = this,
                hasScale = t.readBool();
            if(hasScale){
                var numBits = t.readUB(5),
                    scaleX = t.readFB(numBits),
                    scaleY = t.readFB(numBits);
            }else{ var scaleX = scaleY = 1.0; }
            var hasRotation = t.readBool();
            if(hasRotation){
                var numBits = t.readUB(5),
                    skewX = t.readFB(numBits),
                    skewY = t.readFB(numBits);
            }else{ var skewX =  skewY = 0.0; }
            var numBits = t.readUB(5);
                matrix = {
                    scaleX: scaleX, scaleY: scaleY,
                    skewX: skewX, skewY: skewY,
                    moveX: t.readSB(numBits), moveY: t.readSB(numBits)
                };
            t.align();
            return matrix;
        },

        readCxform: function(){
            return this._readCxf();
        },

        readCxformA: function(){
            return this._readCxf(true);
        },

        _readCxf: function(withAlpha){
            var t = this;
                hasAddTerms = t.readBool(),
                hasMultTerms = t.readBool(),
                numBits = t.readUB(4);
            if(hasMultTerms){
                var multR = t.readSB(numBits) / 256,
                    multG = t.readSB(numBits) / 256,
                    multB = t.readSB(numBits) / 256,
                    multA = withAlpha ? t.readSB(numBits) / 256 : 1;
            }else{ var multR = multG = multB = multA = 1; }
            if(hasAddTerms){
                var addR = t.readSB(numBits),
                    addG = t.readSB(numBits),
                    addB = t.readSB(numBits),
                    addA = withAlpha ? t.readSB(numBits) / 256 : 0;
            }else{ var addR = addG = addB = addA = 0; }
            var cxform = {
                multR: multR, multG: multG, multB: multB, multA: multA,
                addR: addR, addG: addG, addB: addB, addA: addA
            }
            t.align();
            return cxform;
        },

        decompress: function(){
            var t = this,
                b = t._buffer,
                o = t.offset,
                data = b.substr(0, o) + t.unzip();
            t.length = data.length;
            t.offset = o;
            t._buffer = data;
            return t;
        },

        unzip: function uz(raw){
            var t = this,
                buff = [],
                o = DEFLATE_CODE_LENGTH_ORDER,
                m = DEFLATE_CODE_LENGHT_MAP,
                d = DEFLATE_DISTANCE_MAP;
            t.seek(2);
            do{
                var isFinal = t.readUB(1, true),
                    type = t.readUB(2, true);
                if(type){
                    if(1 == type){
                        var distTable = uz.fixedDistTable,
                            litTable = uz.fixedLitTable;
                        if(!distTable){
                            var bitLengths = [];
                            for(var i = 0; i < 32; i++){ bitLengths.push(5); }
                            distTable = uz.fixedDistTable = buildHuffTable(bitLengths);
                        }
                        if(!litTable){
                            var bitLengths = [];
                            for(var i = 0; i <= 143; i++){ bitLengths.push(8); }
                            for(; i <= 255; i++){ bitLengths.push(9); }
                            for(; i <= 279; i++){ bitLengths.push(7); }
                            for(; i <= 287; i++){ bitLengths.push(8); }
                            litTable = uz.fixedLitTable = buildHuffTable(bitLengths);
                        }
                    }else{
                        var numLitLengths = t.readUB(5, true) + 257,
                            numDistLengths = t.readUB(5, true) + 1,
                            numCodeLenghts = t.readUB(4, true) + 4,
                            codeLengths = [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
                        for(var i = 0; i < numCodeLenghts; i++){ codeLengths[o[i]] = t.readUB(3, true); }
                        var codeTable = buildHuffTable(codeLengths),
                            litLengths = [],
                            prevCodeLen = 0,
                            maxLengths = numLitLengths + numDistLengths;
                        while(litLengths.length < maxLengths){
                            var sym = decodeSymbol(t, codeTable);
                            switch(sym){
                                case 16:
                                    var i = t.readUB(2, true) + 3;
                                    while(i--){ litLengths.push(prevCodeLen); }
                                    break;
                                case 17:
                                    var i = t.readUB(3, true) + 3;
                                    while(i--){ litLengths.push(0); }
                                    break;
                                case 18:
                                    var i = t.readUB(7, true) + 11;
                                    while(i--){ litLengths.push(0); }
                                    break;
                                default:
                                    if(sym <= 15){
                                        litLengths.push(sym);
                                        prevCodeLen = sym;
                                    }
                            }
                        }
                        var distTable = buildHuffTable(litLengths.splice(numLitLengths, numDistLengths)),
                            litTable = buildHuffTable(litLengths);
                    }
                    do{
                        var sym = decodeSymbol(t, litTable);
                        if(sym < 256){ buff.push(raw ? sym : fromCharCode(sym)); }
                        else if(sym > 256){
                            var lengthMap = m[sym - 257],
                                len = lengthMap[1] + t.readUB(lengthMap[0], true),
                                distMap = d[decodeSymbol(t, distTable)],
                                dist = distMap[1] + t.readUB(distMap[0], true),
                                i = buff.length - dist;
                            while(len--){ buff.push(buff[i++]); }
                        }
                    }while(256 != sym);
                }else{
                    t.align();
                    var len = t.readUI16(),
                        nlen = t.readUI16();
                    if(raw){ while(len--){ buff.push(t.readUI8()); } }
                    else{ buff.push(t.readString(len)); }
                }
            }while(!isFinal);
            t.seek(4);
            return raw ? buff : buff.join('');
        }
    };

    function buildHuffTable(bitLengths){
        var numLengths = bitLengths.length,
            blCount = [],
            maxBits = max.apply(Math, bitLengths),
            nextCode = [],
            code = 0,
            table = {},
            i = numLengths;
        while(i--){
            var len = bitLengths[i];
            blCount[len] = (blCount[len] || 0) + (len > 0);
        }
        for(var i = 1; i <= maxBits; i++){
            var len = i - 1;
            if(undefined == blCount[len]){ blCount[len] = 0; }
            code = (code + blCount[i - 1]) << 1;
            nextCode[i] = code;
        }
        for(var i = 0; i < numLengths; i++){
            var len = bitLengths[i];
            if(len){
                table[nextCode[len]] = {
                    length: len,
                    symbol: i
                };
                nextCode[len]++;
            }
        }
        return table;
    }

    function decodeSymbol(s, table) {
        var code = 0,
            len = 0;
        while(true){
            code = (code << 1) | s.readUB(1, true);
            len++;
            var entry = table[code];
            if(undefined != entry && entry.length == len){ return entry.symbol }
        }
    }
})();
