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

	_g.Stream = function(url){
		var xhr = Gordon.xhr("GET", url, false);
		xhr.overrideMimeType("text/plain; charset=x-user-defined");
		xhr.send(null);
		if(xhr.status != 200){ throw new Error("Unable to load " + url + " status: " + xhr.status); }
		var t = this;
		t._buffer = xhr.responseText;
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
		
		readNumber: function(numBytes){
			var value = 0;
			var p = this._offset;
			var i = p + numBytes;
			while(i > p){ value = value * 256 + this.readByteAt(--i); }
			this._offset += numBytes;
			return value;
		},
		
		readSNumber: function(numBytes){
			var value = this.readNumber(numBytes);
			var mask = 0x01 << (numBytes * 8 - 1);
			if(value & mask){ value = (~value + 1) * -1; }
			return value;
		},
		
		readSI8: function(){
			return this.readSNumber(1);
		},
		
		readSI16: function(){
			return this.readSNumber(2);
		},
		
		readSI32: function(){
			return this.readSNumber(4);
		},
		
		readUI8: function(){
			return this.readNumber(1);
		},
		
		readUI16: function(){
			return this.readNumber(2);
		},
		
		readUI24: function(){
			return this.readNumber(3);
		},
		  
		readUI32: function(){
			return this.readNumber(4);
		},
		
		readFixed: function(){
			return this._readFixedPoint(32, 16);
		},
		
		readFixed8: function(){
			return this._readFixedPoint(16, 8);
		},
		
		_readFixedPoint: function(numBits, precision){
			var value = this.readSB(numBits);
			value = value * Math.pow(2, -precision)
			return value;
		},
		
		readFloat16: function(){
			return this._readFloatingPoint(5, 10);
		},
		
		readFloat: function(){
			return this._readFloatingPoint(8, 23);
		},
		
		readDouble: function(){
			return this._readFloatingPoint(11, 52);
		},
		
		_readFloatingPoint: function(numEbits, numSbits){
			var numBits = 1 + numEbits + numSbits;
			var numBytes = numBits / 8;
			var t = this;
			if(numBytes > 4){
				var value = 0;
				var numWords = Math.ceil(numBytes / 4);
				var i = numWords;
				while(i--){
					var p = t._offset;
					var offset = numBytes >= 4 ? 4 : numBytes % 4;
					var j = p + offset;
					while(j > p){ value = value * 256 + String.fromCharCode(t.readByteAt(--j)); }
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
			var value = 0;
			var maxExpo = Math.pow(2, numEbits);
			var bias = Math.floor((maxExpo - 1) / 2);
			var scale = Math.pow(2, numSbits);
			var fraction = mantissa / scale;
			if(bias){
				if(bias < maxExpo){ value = Math.pow(2, expo - bias) * (1 + faction); }
				else if(fraction){ value = NaN; }
				else{ value = Infinity; }
			}else if(fraction){ value = Math.pow(2, 1 - bias) * fraction; }
			if(value != NaN && sign){ value *= -1; }
			return value;
		},
		
		readEncodedU32: function(){
			var value = 0;
			var i = 5;
			while(i--){
				var number = this.readNumber();
				value = value * 128 + number & 0x7F;
				if(!(number & 0x80)){ break; }
			}
			return value;
		},
		
		readSB: function(numBits){
			var value = this.readUB(numBits);
			var mask = 0x01 << (numBits - 1);
			if(value & mask){ value -= Math.pow(2, numBits); }
			return value;
		},
		
		readUB: function(numBits){
			var value = 0;
			var t = this;
			var i = numBits;
			while(i--){
				if(t._bitOffset == 8){
					t._bitBuffer = t.readUI8();
					t._bitOffset = 0;
		    	}
		    	var mask = 0x80 >> t._bitOffset;
				value = value * 2 + (t._bitBuffer & mask ? 1 : 0);
				t._bitOffset++;
			}
			return value;
		},
		
		readFB: function(numBits){
			return this._readFixedPoint(numBits, 16);
		},
		
		readString: function(numChars){
			var chars = [];
			var i = numChars || this._length - this._offset;
			while(i--){
				var code = this.readNumber(1);
				if(numChars || code){ chars.push(String.fromCharCode(code)); }
				else{ break; }
			}
			return chars.join('');
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
		
		align: function(){
			this._bitBuffer = null;
			this._bitOffset = 8;
			return this;
		},
		
		readRect: function(){
			var rect = {
				top: 0,
				right: 0,
				bottom: 0,
				left: 0
			};
			var t = this;
			var numBits = t.readUB(5);
			rect.left = _t2p(t.readSB(numBits));
			rect.right = _t2p(t.readSB(numBits));
			rect.top = _t2p(t.readSB(numBits));
			rect.bottom = _t2p(t.readSB(numBits));
			t.align();
			return rect;
		},
		
		readMatrix: function(){
			var matrix = {
				scaleX: 1.0,
				scaleY: 1.0,
				skewX: 0.0,
				skewY: 0.0,
				moveX: 0,
				moveY: 0
			};
			var t = this;
			var hasScale = t.readBool();
			if(hasScale){
				var numBits = t.readUB(5);
				matrix.scaleX = t.readFB(numBits);
				matrix.scaleY = t.readFB(numBits);
			}
			var hasRotation = t.readBool();
			if(hasRotation){
				var numBits = t.readUB(5);
				matrix.skewX = t.readFB(numBits);
				matrix.skewY = t.readFB(numBits);
			}
			var numBits = t.readUB(5);
			matrix.moveX = _t2p(t.readSB(numBits));
			matrix.moveY = _t2p(t.readSB(numBits));
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
			var cxform = {
				multR: 1.0,
				multG: 1.0,
				multB: 1.0,
				multA: 1.0,
				addR: 0.0,
				addG: 0.0,
				addB: 0.0,
				addA: 0.0
			};
			var t = this;
			var hasAddTerms = t.readBool();
			var hasMultTerms = t.readBool();
			var numBits = t.readUB(4);
		    if(hasMultTerms){
				cxform.multR = t.readSB(numBits) / 256;
				cxform.multG = t.readSB(numBits) / 256;
				cxform.multB = t.readSB(numBits) / 256;
				if(withAlpha){ cxform.multA = t.readSB(numBits) / 256; }
		    }
		    if(hasAddTerms){
				cxform.addR = t.readSB(numBits);
				cxform.addG = t.readSB(numBits);
				cxform.addB = t.readSB(numBits);
				if(withAlpha){ cxform.addA = t.readSB(numBits); }
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
		}
	};
})();
