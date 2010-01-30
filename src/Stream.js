/*
 *    Gordon: An open source Flash™ runtime written in pure JavaScript
 *
 *    Copyright (c) 2010 Tobias Schneider
 *    Gordon is freely distributable under the terms of the MIT license.
 */

Gordon.require("src/inflate");

(function(){
	var _g = Gordon;
	var _t2p = _g.twips2px;
	
	_g.Stream = function(data){
		var t = this;
		t._buffer = data;
		t._length = t._buffer.length;
		t._offset = 0;
		t._bitBuffer = null;
		t._bitOffset = 8;
	};
	_g.Stream.prototype = {	
		decompress: function() {
			var t = this;
			t._offset += 2;
			var header = t._buffer.substr(0, t._offset);
			var data = zip_inflate(t._buffer.substr(t._offset));
			t._buffer = header + data;
			t._length = t._buffer.length;
			return t;
		},
		
		readByteAt: function(position){
			return this._buffer.charCodeAt(position) & 0xff;
		},
		
		readNumber: function(numBytes, bigEndian){
			var t = this;
			var value = 0;
			if(bigEndian){
				var i = numBytes;
				while(i--){ value = value * 256 + t.readByteAt(t._offset++); }
			}else{
				var o = t._offset;
				var i = o + numBytes;
				while(i > o){ value = value * 256 + t.readByteAt(--i); }
				t._offset += numBytes;
			}
			t.align();
			return value;
		},
		
		readSNumber: function(numBytes, bigEndian){
			var value = this.readNumber(numBytes, bigEndian);
			var numBits = numBytes * 8;
			if(value >> (numBits - 1)){ value -= Math.pow(2, numBits); }
			return value;
		},
		
		readSI8: function(){
			return this.readSNumber(1);
		},
		
		readSI16: function(bigEndian){
			return this.readSNumber(2, bigEndian);
		},
		
		readSI32: function(bigEndian){
			return this.readSNumber(4, bigEndian);
		},
		
		readUI8: function(){
			return this.readByteAt(this._offset++);
		},
		
		readUI16: function(bigEndian){
			return this.readNumber(2, bigEndian);
		},
		
		readUI24: function(bigEndian){
			return this.readNumber(3, bigEndian);
		},
		  
		readUI32: function(bigEndian){
			return this.readNumber(4, bigEndian);
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
		
		_readFloatingPoint: function(numEbits, numSbits){
			var numBits = 1 + numEbits + numSbits;
			var numBytes = numBits / 8;
			var t = this;
			if(numBytes > 4){
				var value = 0;
				var i = Math.ceil(numBytes / 4);
				while(i--){
					var o = t._offset;
					var j = o + numBytes >= 4 ? 4 : numBytes % 4;
					while(j > o){ value = value * 256 + String.fromCharCode(t.readByteAt(--j)); }
					t._offset += numBytes;
					numBytes -= numBytes;
				}
				var mask = 0x01 << (numBits - 1);
				var sign = value & mask;
				var expo = 0;
				var i = numEbits;
				while(i--){
					mask >>= 1;
					expo |= buffer & mask ? 1 : 0;
					expo <<= 1;
				}
				var mantissa = 0;
				var i = numSbits;
				while(i--){
					mask >>= 1;
					if(buffer & mask){ mantissa += Math.pow(2, i - 1); }
				}
			}else{
				var sign = t.readUB(1);
				var expo = t.readUB(numEbits);
				var mantissa = t.readUB(numSbits);
			}
			var maxExpo = Math.pow(2, numEbits);
			var bias = Math.floor((maxExpo - 1) / 2);
			var scale = Math.pow(2, numSbits);
			var fraction = mantissa / scale;
			if(bias){
				if(bias < maxExpo){ var value = Math.pow(2, expo - bias) * (1 + faction); }
				else if(fraction){ var value = NaN; }
				else{ var value = Infinity; }
			}else if(fraction){ var value = Math.pow(2, 1 - bias) * fraction; }
			else{ var value = 0; }
			if(value != NaN && sign){ value *= -1; }
			return value;
		},
		
		readFloat16: function(){
			return this._readFloatingPoint(5, 10);
		},
		
		readDouble: function(){
			return this._readFloatingPoint(11, 52);
		},
		
		readEncodedU32: function(){
			var value = 0;
			var i = 5;
			while(i--){
				var number = this.readByteAt(this._offset++);
				value = value * 128 + (number & 0x7F);
				if(!(number & 0x80)){ break; }
			}
			return value;
		},
		
		readSB: function(numBits){
			var value = this.readUB(numBits);
			if(value >> (numBits - 1)){ value -= Math.pow(2, numBits); }
			return value;
		},
		
		readUB: function(numBits){
			var t = this;
			var value = 0;
			var i = numBits;
			while(i--){
				if(8 == t._bitOffset){
					t._bitBuffer = t.readUI8();
					t._bitOffset = 0;
		    	}
				value = value * 2 + (t._bitBuffer & (0x80 >> t._bitOffset) ? 1 : 0);
				t._bitOffset++;
			}
			return value;
		},
		
		readFB: function(numBits){
			return this._readFixedPoint(numBits, 16);
		},
		
		readString: function(numChars){
			var t = this;
			var b = t._buffer;
			if(numChars){
				var string = b.substr(t._offset, numChars);
				t._offset += numChars;
			}else{
				numChars = t._length - t._offset;
				var chars = [];
				var i = numChars;
				while(i--){
					var code = t.readByteAt(t._offset++);
					if(code){ chars.push(String.fromCharCode(code)); }
					else{ break; }
				}
				var string = chars.join('');
			}
			return string;
		},
		
		readBool: function(numBits){
			return !!this.readUB(numBits || 1);
		},
		
		readLanguageCode: function(){
			return this.readUI8();
		},
		
		readRgb: function(){
			return {
				r: this.readUI8(),
				g: this.readUI8(),
				b: this.readUI8()
			}
		},
		
		readRgba: function(){
			var rgba = this.readRgb();
			rgba.a = this.readUI8() / 256;
			return rgba;
		},
		
		readArgb: function(){
			var alpha = this.readUI8() / 256;
			var rgba = this.readRGB();
			rgba.a = alpha;
			return rgba;
		},
		
		readRect: function(){
			var t = this;
			var numBits = t.readUB(5);
			var rect = {
				left: _t2p(t.readSB(numBits)),
				right: _t2p(t.readSB(numBits)),
				top: _t2p(t.readSB(numBits)),
				bottom: _t2p(t.readSB(numBits))
			}
			t.align();
			return rect;
		},
		
		readMatrix: function(){
			var t = this;
			var hasScale = t.readBool();
			if(hasScale){
				var numBits = t.readUB(5);
				var scaleX = t.readFB(numBits);
				var scaleY = t.readFB(numBits);
			}else{ var scaleX = scaleY = 1.0; }
			var hasRotation = t.readBool();
			if(hasRotation){
				var numBits = t.readUB(5);
				var skewX = t.readFB(numBits);
				var skewY = t.readFB(numBits);
			}else{ var skewX =  skewY = 0.0; }
			var numBits = t.readUB(5);
			var matrix = {
				scaleX: scaleX, scaleY: scaleY,
				skewX: skewX, skewY: skewY,
				moveX: _t2p(t.readSB(numBits)),
				moveY: _t2p(t.readSB(numBits))
			};
			t.align();
			return matrix;
		},
		
		readCxform: function(){
			return this._readCxform();
		},
		
		readCxformWithAlpha: function(){
			return this._readCxform(true);
		},
		
		_readCxform: function(withAlpha){
			var t = this;
			var hasAddTerms = t.readBool();
			var hasMultTerms = t.readBool();
			var numBits = t.readUB(4);
		    if(hasMultTerms){
				var multR = t.readSB(numBits) / 256;
				var multG = t.readSB(numBits) / 256;
				var multB = t.readSB(numBits) / 256;
				var multA = withAlpha ? t.readSB(numBits) / 256 : 1;
		    }else{ var multR = multG = multB = multA = 1; }
		    if(hasAddTerms){
				var addR = t.readSB(numBits);
				var addG = t.readSB(numBits);
				var addB = t.readSB(numBits);
				var addA = withAlpha ? t.readSB(numBits) : 0;
		    }else{ var addR = addG = addB = addA = 0; }
			var cxForm = {
				multR: multR, multG: multG, multB: multB, multA: multA,
				addR: addR, addG: addG, addB: addB, addA: addA
			}
		    t.align();
			return cxform;
		},
		
		tell: function(){
			return this._offset;
		},
		
		seek: function(offset, absolute){
			this._offset = (absolute ? 0 : this._offset) + offset;
			return this;
		},
		
		reset: function(){
			this._offset = 0;
			this.align();
			return this;
		},
		
		align: function(){
			this._bitBuffer = null;
			this._bitOffset = 8;
			return this;
		}
	};
})();
