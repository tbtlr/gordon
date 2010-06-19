(function(){
    var LOCATION_DIRNAME = win.location.href.replace(/[^\/]*$/, ''),
        defaults = {
            id: '',
            width: 0,
            height: 0,
            autoplay: true,
            loop: true,
            quality: Gordon.qualityValues.HIGH,
            scale: Gordon.scaleValues.SHOW_ALL,
            bgcolor: '',
            poster: '',
            renderer: null,
            onprogress: function(percent){},
            onreadystatechange: function(state){}
        };
        
    Gordon.Movie = function(url, options){
        var t = this,
            s = Gordon.readyStates;
        t.url = url;
        for(var prop in defaults){ t[prop] = prop in options ? options[prop] : defaults[prop]; }
        if(!url){ throw new Error("URL of a SWF movie file must be passed as first argument"); }
        t._startTime = +new Date;
        t.framesLoaded = 0;
        t.isPlaying = false;
        t.currentFrame = 0;
        t.currentLabel = undefined;
        t._readyState = s.UNINITIALIZED;
        t._changeReadyState(t._readyState);
        var d = t._dictionary = {},
            l = t._timeline = [];
        t._changeReadyState(s.LOADING);
        new Gordon.Parser((/^\w:\/\//.test(url) ? '' : LOCATION_DIRNAME) + url, function(obj){
            var action = obj.action;
            if(action){ eval("obj.action = function(){ " + action + "; }"); }
            switch(obj.type){
                case "header":
                    for(var prop in obj){ t['_' + prop] = obj[prop]; }
                    var f = t._frameSize,
                        r = t.renderer = t.renderer || Gordon.SvgRenderer,
                        id = t.id;
                    if(!(t.width && t.height)){
                        t.width = (f.right - f.left) / 20;
                        t.height = (f.bottom - f.top) / 20;
                    };
                    t._renderer = new r(t.width, t.height, f, t.quality, t.scale, t.bgcolor);
                    t.totalFrames = t._frameCount;
                    if(id){
                        var stage = t._stage = doc.getElementById(id),
                            bgcolor = t.bgcolor,
                            bgParts = [],
                            poster = t.poster;
                        stage.innerHTML = '';
                        if(t.bgcolor){ bgParts.push(bgcolor); }
                        if(poster){ bgParts.push(poster, "center center"); }
                        if(bgParts.length){ stage.setAttribute("style", "background: " + bgParts.join(' ')); }
                    }
                    t._changeReadyState(s.LOADED);
                    break;
                case "frame":
                    t._renderer.frame(obj);
                    l.push(obj);
                    var lbl = obj.label,
                        n = ++t.framesLoaded;
                    if(lbl){ t._labeledFrameNums[lbl] = n; }
                    t.onprogress(~~((n * 100) / t.totalFrames));
                    if(1 == n){
                        var stage = t._stage;
                        if(stage){
                            stage.appendChild(t._renderer.node);
                            t._changeReadyState(s.INTERACTIVE);
                        }
                        if(t.autoplay){ t.play(); }
                        else{ t.goTo(1); }
                    }
                    if(n == t.totalFrames){ t._changeReadyState(s.COMPLETE); }
                    break;
                default:
                    t._renderer.define(obj);
                    d[obj.id] = obj;
            }
        });
    };
    Gordon.Movie.prototype = {
        _changeReadyState: function(state){
            this._readyState = state;
            this.onreadystatechange(state);
            return this;
        },
        
        play: function(){
            var t = this,
                c = t.currentFrame,
                timeout = 1000 / t._frameRate;
            t.isPlaying = true;
            if(c < t.totalFrames){
                if(t.framesLoaded > c){ t.goTo(c + 1); }
                else{ timeout = 0; }
            }else{
                if(!t.loop){ return t.stop(); }
                else{ t.goTo(1); }
            }
            setTimeout(function(){
                if(t.isPlaying){ t.play() };
            }, timeout);
            return t;
        },
        
        next: function(){
            var t = this,
                c = t.currentFrame;
            t.goTo(c < t.totalFrames ? c + 1 : 1);
            return t;
        },
        
        goTo: function gf(frmNumOrLabel){
            var t = this,
                c = t.currentFrame,
                r = t._renderer;
            if(gf.caller !== t.play){ t.stop(); }
            if(isNaN(frmNumOrLabel)){
                var frmNum = t._labeledFrameNums[frmNumOrLabel];
                if(frmNum){ t.goTo(frmNum); }
            }else if(frmNumOrLabel != c){
                if(frmNumOrLabel < c){ c = t.currentFrame = 0; }
                var l = t._timeline;
                while(c != frmNumOrLabel){
                    c = ++t.currentFrame;
                    var idx = c - 1,
                        frm = l[idx],
                        action = frm.action;
                    r.show(idx);
                    t.currentLabel = frm.lbl;
                    if(action){ action.call(this); }
                }
            }
            return t;
        },
        
        stop: function(){
            this.isPlaying = false;
            return this;
        },
        
        prev: function(){
            var t = this,
                c = t.currentFrame;
            t.goTo(c > 1 ? c - 1 : t.totalFrames);
            return t;
        },
        
        rewind: function(){
            this.goTo(1);
            return this;
        },
        
        getURL: function(url, target){
            var u = Gordon.urlTargets;
            switch(target){
                case u.BLANK:
                    win.open(url);
                    break;
                case u.PARENT:
                    win.parent.location.href = url;
                    break;
                case u.TOP:
                    win.top.location.href = url;
                    break;
                default:
                    win.location.href = url;
            }
            return this;
        },
        
        toggleQuality: function thq(){
            var o = thq._quality,
                t = this,
                q = t.quality;
            if(o){
                q = t.quality = o;
                thq._quality = null;
            }else{ t.quality = thq._quality = q; }
            t._renderer.setQuality(q);
            return t;
        },
        
        getTime: function(){
            return this._startTime;
        }
    };
})();
