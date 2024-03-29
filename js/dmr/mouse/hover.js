/*
port of jQuery Hover Intent for Dojo
Author: Chris Deemer
originally intended for use with WSC
 */

define([
    "dojo/_base/kernel",
    "dojo/_base/declare",
    "dojo/_base/array",
    "dojo/_base/lang",
    "dojo/dom",
    "dojo/on",
    "dojo/_base/event",
    "dojo/mouse"
], function(kernel, declare, array, lang, dom, on, evt, mouse){

    //logs message to console that this module is experimental
    kernel.experimental("dmr.mouse.hover");

    var hover, clz = declare(null,{
        defaultEvent: 'hover',
        subEvents: ['end'],
        _elements: null,
        //hover intent variables
        interval: 100,
        sensitivity: 7,
        timeout: 200,
        cX: null,
        cY: null,
        pX: null,
        pY: null,
        constructor: function(args){
            lang.mixin(this, args);
            this.init();
        },
        init: function(){
            this._elements = [];

            var evt = this.defaultEvent;
            this.call = this._handle(evt);

            this._events = [evt];
            array.forEach(this.subEvents, function(subEvt){
                this[subEvt] = this._handle(evt + '.' + subEvt);
                this._events.push(evt + '.' + subEvt);
            }, this);
        },
        enter: function(e, element){
            evt.stop(e);
            var el = this._getElement(element.target);
            if (el.hoverTimeout) { el.hoverTimeout = clearTimeout(el.hoverTimeout); }
            // var _compare = lang.hitch(this, "comparePos", e);
            // set "previous" X and Y position based on initial entry point
            pX = e.pageX;
            pY = e.pageY;
            // update "current" X and Y position based on mousemove
            el.moveTracker = on(element.target, "mousemove", this.setCurPos);
            // start polling interval (self-calling timeout) to compare mouse coordinates over time
            var _compare = lang.hitch(this, "comparePos", element.target);
            if (el.hoverStatus != 1) {
                el.hoverTimeout = setTimeout(_compare, this.interval);
            }
        },
        leave: function(e, element){
            evt.stop(e);
            var el = this._getElement(element.target);
            el.hoverTimeout = clearTimeout(el.hoverTimeout);
            if(typeof el.moveTracker !== "undefined"){
                el.moveTracker.remove();
            }
            var _unhover = lang.hitch(this, "unhover", element.target);
            //called on every mouse entering the dom element (right now)
            // this.fire(e.target, {type: "hover.end"});
            // unbind expensive mousemove event
            //TODO: convert to dojo
            // $(this).off("mousemove.hoverIntent",track);
            // if hoverIntent state is true, then call the mouseOut function after the specified delay
            if (el.hoverStatus == 1) {
                el.hoverTimeout = setTimeout(_unhover, this.timeout);
            }
        },
        setCurPos: function(e){
            //update current moust position
            cX = e.pageX;
            cY = e.pageY;
        },
        comparePos: function(currentTarget){
            var el = this._getElement(currentTarget);
            el.hoverTimeout = clearTimeout(el.hoverTimeout);
            //compare mouse positions to see if they've crossed the "threshold"
            if ( ( Math.abs(pX-cX) + Math.abs(pY-cY) ) < this.sensitivity ) {
                el.moveTracker.remove();
                // set hoverIntent state to true (so mouseOut can be called)
                el.hoverStatus = 1;
                //TODO: cfg doesn't exist anymore - what is "over"
                // return cfg.over.apply(o,[e]);
                return this.fire(currentTarget, {type: "hover"});
            } else {
                var _compare = lang.hitch(this, "comparePos", currentTarget);
                // set previous coordinates for next time
                pX = cX; pY = cY;
                // use self-calling timeout, guarantees intervals are spaced out properly (avoids JavaScript timer bugs)
                el.hoverTimeout = setTimeout( _compare , this.interval );
            }
        },
        unhover: function(currentTarget){
            var el = this._getElement(currentTarget);
            el.hoverStatus = 0;
            return this.fire(currentTarget, {type: "hover.end"});
        },
        _handle: function(/*String*/eventType){
            // summary:
            //      Bind listen handler for the given custom events
            //      the returned handle will be used internally by dojo/on
            var self = this;
            //called by dojo/on
            return function(node, listener){
                // normalize, arguments might be (null, node, listener)
                var a = arguments;
                if(a.length > 2){
                    node = a[1];
                    listener = a[2];
                }
                var isNode = node && (node.nodeType || node.attachEvent || node.addEventListener);
                if(!isNode){
                    return on(node, eventType, listener);
                }else{
                    var onHandle = self._add(node, eventType, listener);
                    var signal = {
                        remove: function(){
                            onHandle.remove();
                            self._remove(node, eventType);
                        }
                    };
                    return signal;
                }
            }; // dojo/on handle
        },
        _add: function(/*Dom*/node, /*String*/type, /*function*/listener){
            // summary:
            //      Bind dojo/on handlers for both gesture event(e.g 'tab.hold')
            //      and underneath 'press'|'move'|'release' events
            var element = this._getElement(node);
            if(!element){
                // the first time listening to the node
                element = {
                    target: node,
                    data: {},
                    handles: {},
                    hoverStatus: 0,
                    hoverTimeout: null,
                    moveTracker: null
                };

                //first setup the handlers for our custom handlers
                var _enter = lang.hitch(this, "_process", element, "enter");
                var _leave = lang.hitch(this, "_process", element, "leave");

                //create the link between native events and our custom handlers
                var handles = element.handles;
                handles.enter = on(node, mouse.enter, _enter);
                handles.leave = on(node, mouse.leave, _leave);
                this._elements.push(element);
            }
            // track num of listeners for the hover event - type
            // so that we can release element if no more hovers being monitored
            element.handles[type] = !element.handles[type] ? 1 : ++element.handles[type];

            return on(node, type, listener); //handle
        },
        _getElement: function(/*Dom*/node){
            // summary:
            //      Obtain a gesture element for the give node
            var i = 0, element;
            for(; i < this._elements.length; i++){
                element = this._elements[i];
                if(element.target === node){
                    return element;
                }
            }
        },
        _process: function(element, phase, e){
            // summary:
            //      Process and dispatch to appropriate phase handlers.
            //      Also provides the machinery for managing gesture bubbling.
            // description:
            //      1. e._locking is used to make sure only the most inner node
            //      will be processed for the same gesture, suppose we have:
            //  |   on(inner, dojox.gesture.tap, func1);
            //  |   on(outer, dojox.gesture.tap, func2);
            //      only the inner node will be processed by tap gesture, once matched,
            //      the 'tap' event will be bubbled up from inner to outer, dojo.StopEvent(e)
            //      can be used at any level to stop the 'tap' event.
            //
            //      2. Once a node starts being processed, all it's descendant nodes will be locked.
            //      The same gesture won't be processed on its descendant nodes until the lock is released.
            // element: Object
            //      Gesture element
            // phase: String
            //      Phase of a gesture to be processed, might be 'press'|'move'|'release'|'cancel'
            // e: Event
            //      Native event
            e._locking = e._locking || {};
            if(e._locking[this.defaultEvent] || this.isLocked(e.target)){
                return;
            }
            // invoking gesture.press()|move()|release()|cancel()
            // #16900: same condition as in dojo/touch, to avoid breaking the editing of input fields.
            if((e.target.tagName != "INPUT" || e.target.type == "radio" || e.target.type == "checkbox") && e.target.tagName != "TEXTAREA"){
                e.preventDefault();
            }
            e._locking[this.defaultEvent] = true;
            this[phase](e, element);
        },
        _cleanHandles: function(/*Object*/handles){
            // summary:
            //      Clean up on handles
            for(var x in handles){
                //remove handles for "press"|"move"|"release"|"cancel"
                if(handles[x].remove){
                    handles[x].remove();
                }
                delete handles[x];
            }
        },
        _remove: function(/*Dom*/node, /*String*/type){
            // summary:
            //      Check and remove underneath handlers if node
            //      is not being listened for 'this' gesture anymore,
            //      this happens when user removed all previous on() handlers.
            var element = this._getElement(node);
            if(!element || !element.handles){ return; }

            element.handles[type]--;

            var handles = element.handles;
            if(!array.some(this._events, function(evt){
                return handles[evt] > 0;
            })){
                // clean up if node is not being listened anymore
                this._cleanHandles(handles);
                var i = array.indexOf(this._elements, element);
                if(i >= 0){
                    this._elements.splice(i, 1);
                }
            }
        },
        fire: function(node, event){
            // summary:
            //      Fire a hover event ("hover" or "hover.end") and invoke registered listeners
            // node: DomNode
            //      Target node to fire the gesture
            // event: Object
            //      An object containing specific hover info e.g {type: 'hover'|'hover.end'), ...}
            //      all these properties will be put into a simulated HoverEvent when fired.
            //      Note - Default properties in a native Event won't be overwritten, see on.emit() for more details.
            if(!node || !event){
                return;
            }
            event.bubbles = true;
            event.cancelable = true;
            on.emit(node, event.type, event);
        },
        lock: function(/*Dom*/node){
            // summary:
            //      Lock all descendants of the node.
            // tags:
            //      protected
            this._lock = node;
        },
        unLock: function(){
            // summary:
            //      Release the lock
            // tags:
            //      protected
            this._lock = null;
        },
        isLocked: function(node){
            // summary:
            //      Check if the node is locked, isLocked(node) means
            //      whether it's a descendant of the currently locked node.
            // tags:
            //      protected
            if(!this._lock || !node){
                return false;
            }
            return this._lock !== node && dom.isDescendant(node, this._lock);
        },
        destroy: function(){
            // summary:
            //      Release all handlers and resources
            array.forEach(this._elements, function(element){
                this._cleanHandles(element.handles);
            }, this);
            this._elements = null;
        }
    });

    hover = new clz();

    hover.Hover = clz;

    return hover;
});