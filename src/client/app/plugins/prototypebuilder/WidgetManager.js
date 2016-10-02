/**
 * @module WidgetManager
 * @desc WidgetManager deals with interacting with user interface widgets used for prototyping picture based uis.
 * @author Patrick Oladimeji
 * @date 10/30/13 21:42:56 PM
 */
/*jslint vars: true, plusplus: true, devel: true, nomen: true, indent: 4, maxerr: 50*/
/*global define, _, Promise */
define(function (require, exports, module) {
    "use strict";
    var d3 = require("d3/d3"),
        eventDispatcher = require("util/eventDispatcher"),
        imageMapper     = require("imagemapper"),
        uidGenerator    = require("util/uuidGenerator"),
        EditWidgetView  = require("pvsioweb/forms/editWidget"),
        Button          = require("widgets/Button"),
        TouchscreenButton  = require("widgets/TouchscreenButton"),
        TouchscreenDisplay = require("widgets/TouchscreenDisplay"),
        LED             = require("widgets/LED"),
        BasicDisplay    = require("widgets/BasicDisplay"),
        NumericDisplay  = require("widgets/NumericDisplay"),
        Storyboard      = require("pvsioweb/Storyboard"),
        EmuTimer        = require("widgets/EmuTimer"),
        NewWidgetView   = require("pvsioweb/forms/newWidget"),
        StateParser     = require("util/PVSioStateParser"),
        ButtonActionsQueue = require("widgets/ButtonActionsQueue").getInstance(),
        PreferenceKeys  = require("preferences/PreferenceKeys"),
        Preferences     = require("preferences/PreferenceStorage").getInstance();
    var wm, mapCreator;

   ///TODO this should be moved out of this file and promoted to a property, or a function parameter in createImageMap
    function renderResponse(err, res) {
        if (!err) {
            var state = StateParser.parse(res.data[0]);
            wm.getAllWidgets().forEach(function (w) {
                w.render(state);
            });
        } else {
            if (err.failedCommand && err.failedCommand.indexOf("tick(") === 0) {
                wm.stopTimers();
                console.log("wallclock paused (tick function not implemented in the selected prototype)");
            }
        }
    }
    function createImageMap(widget) {
        if (widget.needsImageMap()) {
            widget.createImageMap({
                callback: renderResponse
            });
        }
    }
    function handleWidgetEdit(widget, wm) {
        if (widget) {
            EditWidgetView.create(widget)
                .on("ok", function (e, view) {
                    view.remove();
                    widget.updateWithProperties(e.data);
                    widget.updateStyle(e.data);
                    widget.render();
                    //create an interactive image area only if there isnt one already
                    createImageMap(widget);
                    if (e.data.keyCode) {
                        wm._keyCode2widget[e.data.keyCode] = widget;
                    }
                    // fire event widget modified
                    wm.fire({type: "WidgetModified"});
                }).on("cancel", function (e, view) {
                    view.remove();
                });
        }
    }
    function handleTimerEdit(emuTimer, wm) {
        EditWidgetView.create(emuTimer)
            .on("ok", function (e, view) {
                view.remove();
                emuTimer.updateWithProperties(e.data);
                // fire event widget created
                var event = { type: "TimerModified", action: "create", timer: emuTimer };
                wm.fire(event);
            }).on("cancel", function (e, view) {
                view.remove();
            });
    }
    function installKeypressHandler(wm) {
        d3.select(document).on("keydown", function () {
            if (d3.select("#btnSimulatorView").classed("active")) {
                var eventKeyCode = d3.event.which;
                var widget = wm._keyCode2widget[eventKeyCode];
                if (widget && typeof widget.evts === "function" && widget.evts().indexOf('click') > -1) {
                    widget.click({ callback: renderResponse });
                    halo(widget.id());
                    d3.event.preventDefault();
                    d3.event.stopPropagation();
                } else if (widget && typeof widget.evts === "function" && widget.evts().indexOf("press/release") > -1) {
                    widget.pressAndHold({ callback: renderResponse });
                    halo(widget.id());
                    d3.event.preventDefault();
                    d3.event.stopPropagation();
                }
            }
        });
        d3.select(document).on("keyup", function () {
            if (d3.select("#btnSimulatorView").classed("active")) {
                var eventKeyCode = d3.event.which;
                var widget = wm._keyCode2widget[eventKeyCode];
                if (widget && typeof widget.evts === "function" && widget.evts().indexOf("press/release") > -1) {
                    widget.release({ callback: renderResponse });
                }
                haloOff();
            }
        });
    }
    function halo (buttonID) {
        var coords = d3.select("." + buttonID).attr("coords");
        coords = coords.split(",");
        var pos = {x1: +coords[0], y1: +coords[1], x2: +coords[2], y2: coords[3]};
        var w = pos.x2 - pos.x1, hrad = w / 2, h = pos.y2 - pos.y1, vrad = h / 2, brad = hrad + "px " + vrad + "px";
        var mark = d3.select(".animation-halo");
        if (mark.empty()) {
            mark = d3.select("#imageDiv").append("div").attr("class", "animation-halo");
        }
        mark.style("top", pos.y1 + "px").style("left", pos.x1 + "px")
            .style("width", (pos.x2 - pos.x1) + "px").style("height", (pos.y2 - pos.y1) + "px")
            .style("border-top-left-radius", brad).style("border-top-right-radius", brad)
            .style("border-bottom-left-radius", brad).style("border-bottom-right-radius", brad);
    }
    function haloOff (buttonID) {
        d3.select(".animation-halo").remove();
    }

    /**
        @class WidgetManager
        @classdesc WidgetManager deals with interacting with user interface widgets used for prototyping picture based uis.
    */
    /**
     * Instantiates a new WidgetManager
     * @private
     */
    function WidgetManager() {
        this._widgets = {};
        this._timers = {};
        this._keyCode2widget = {}; // this table stores information about the relation between keyCodes and widgets
        Preferences.addListener("preferenceChanged", function (e) {
            if (e.key === "WALL_CLOCK_INTERVAL" && wm._timers.tick) {
                var timerRate = Preferences.get(PreferenceKeys.WALL_CLOCK_INTERVAL) * 1000;
                wm._timers.tick.updateInterval(timerRate);
                console.log("tick timer interval updated to " + timerRate / 1000 + " secs");
            }
        });
        eventDispatcher(this);
    }

    function createWidget(w) {
        var widget = null;
        var x = w.x, y = w.y, height = w.height, width = w.width, scale = w.scale;
        w.type = w.type.toLowerCase();
        if (w.type === "button") {
            widget = new Button(w.id,
                { top: y * scale, left: x * scale, width: width * scale, height: height * scale },
                { callback: renderResponse,
                  keyCode: w.keyCode,
                  keyName: w.keyName,
                  functionText: w.functionText,
                  evts: w.evts,
                  buttonReadback: w.buttonReadback });
        } else if (w.type === "display") {
            widget = new BasicDisplay(w.id,
                { top: y * scale, left: x * scale, width: width * scale, height: height * scale },
                { displayKey: w.displayKey,
                  auditoryFeedback: w.auditoryFeedback,
                  visibleWhen: w.visibleWhen,
                  fontsize: w.fontsize,
                  fontColor: w.fontColor,
                  backgroundColor: w.backgroundColor,
                  parent: "imageDiv" });
        } else if (w.type === "numericdisplay") {
            widget = new NumericDisplay(w.id,
                { top: y * scale, left: x * scale, width: width * scale, height: height * scale },
                { displayKey: w.displayKey,
                  cursorName: w.cursorName,
                  auditoryFeedback: w.auditoryFeedback,
                  visibleWhen: w.visibleWhen,
                  fontsize: w.fontsize,
                  fontColor: w.fontColor,
                  backgroundColor: w.backgroundColor,
                  parent: "imageDiv" });
        } else if (w.type === "touchscreendisplay") {
            widget = new TouchscreenDisplay(w.id,
                { top: y * scale, left: x * scale, width: width * scale, height: height * scale },
                { callback: renderResponse,
                  displayKey: w.displayKey,
                  cursorName: w.cursorName,
                  auditoryFeedback: w.auditoryFeedback,
                  visibleWhen: w.visibleWhen,
                  functionText: w.functionText,
                  fontsize: w.fontsize,
                  fontColor: w.fontColor,
                  backgroundColor: w.backgroundColor,
                  parent: "imageDiv" });
        } else if (w.type === "touchscreenbutton") {
            widget = new TouchscreenButton(w.id,
                { top: y * scale, left: x * scale, width: width * scale, height: height * scale },
                { callback: renderResponse,
                  functionText: w.functionText,
                  softLabel: w.softLabel,
                  auditoryFeedback: w.auditoryFeedback,
                  visibleWhen: w.visibleWhen,
                  fontsize: w.fontsize,
                  fontColor: w.fontColor,
                  backgroundColor: w.backgroundColor,
                  parent: "imageDiv" });
        } else if (w.type === "led") {
            widget = new LED(w.id,
                { top: y * scale, left: x * scale, width: width * scale, height: height * scale },
                { ledKey: w.ledKey,
                  color: w.ledColor,
                  visibleWhen: w.visibleWhen,
                  parent: "imageDiv" });
        } else if (w.type === "storyboard") {
            widget = new Storyboard(w.id);
        } else {
            console.log("Warning: unrecognised widget type " + w.type);
        }
        return widget;
    }

    WidgetManager.prototype.initialiseWidgets = function () {
        ButtonActionsQueue.sendINIT(renderResponse);
        return this;
    };

    /**
        Restores the widget definitions passed in the parameter.
        @param {Object} defs JSOn specification for the widget definitions to restore
        @memberof WidgetManager
     */
    WidgetManager.prototype.restoreWidgetDefinitions = function (defs) {
        var wm = this;
        this.clearWidgets();
        if (defs) {
            wm._keyCode2widget = {};
            var widget;
            _.each(defs.widgetMaps, function (w, i) {
                defs.regionDefs = defs.regionDefs || [];
                var coords = ((i < defs.regionDefs.length) && defs.regionDefs[i].coords) ? defs.regionDefs[i].coords.split(",") : [0,0,0,0];
                w.height = parseFloat(coords[3]) - parseFloat(coords[1]);
                w.width  = parseFloat(coords[2]) - parseFloat(coords[0]);
                w.x = parseFloat(coords[0]);
                w.y = parseFloat(coords[1]);
                w.scale = (d3.select("svg > g").node()) ?
                             +(d3.select("svg > g").attr("transform").replace("scale(", "").replace(")", "")) || 1 : 1;
                var widget = createWidget(w);
                if (widget) {
                    wm.addWidget(widget);
                    if (typeof widget.keyCode === "function" && widget.keyCode() && widget.type() === "button") {
                        wm._keyCode2widget[widget.keyCode()] = widget;
                    }
                }
            });

            //create div
            if (defs.regionDefs) {
                defs.regionDefs.forEach(function (d) {
                    widget = wm.getWidget(d["class"]);
                    var coords = d.coords.split(",").map(function (d) {
                        return parseFloat(d);
                    });
                    var h = parseFloat(coords[3]) - parseFloat(coords[1]),
                        w = parseFloat(coords[2]) - parseFloat(coords[0]),
                        x = parseFloat(coords[0]),
                        y = parseFloat(coords[1]);
                    var mark = mapCreator.restoreRectRegion({x: x, y: y, width: w, height: h});
                    mark.attr("id", widget.id()).classed(widget.type(), true);
                    widget.element(mark);
                    createImageMap(widget);
                    //set the font-size of the mark to be 80% of the height and the id of the mark
                    mark.on("dblclick", function () {
                        handleWidgetEdit(wm.getWidget(mark.attr("id")), wm);
                    });
                });
            }
            installKeypressHandler(this);
        }
    };

    function round(v) {
        return Math.round(v * 10) / 10;
    }

    WidgetManager.prototype.updateMapCreator = function (scale, cb) {
        scale = scale || 1;
        var wm = this, event = {type: "WidgetModified"};
        imageMapper({scale: scale, element: "#imageDiv img", parent: "#imageDiv", onReady: function (mc) {
            mapCreator = mc.on("create", function (e) {
                var region = e.region;
                region.on("dblclick", function () {
                    handleWidgetEdit(wm.getWidget(region.attr("id")), wm);
                });
                //pop up the widget edit dialog
                var coord = {
                    top: round(e.pos.y),
                    left: round(e.pos.x),
                    width: round(e.pos.width),
                    height: round(e.pos.height)
                };
                NewWidgetView.create(coord)
                    .on("ok", function (e, view) {
                        view.remove();
                        e.data.id = e.data.type + "_" + uidGenerator();
                        e.data.scale = (d3.select("svg > g").node()) ?
                                        +(d3.select("svg > g").attr("transform").replace("scale(", "").replace(")", "")) || 1 : 1;
                        e.data.height = parseFloat(d3.select("#imageDiv .selected rect").attr("height"));
                        e.data.width = parseFloat(d3.select("#imageDiv .selected rect").attr("width"));
                        e.data.x = parseFloat(d3.select("#imageDiv .selected rect").attr("x"));
                        e.data.y = parseFloat(d3.select("#imageDiv .selected rect").attr("y"));
                        var widget = createWidget(e.data);
                        if (widget) {
                            region.classed(widget.type(), true).attr("id", widget.id());
                            widget.element(region);
                            createImageMap(widget);
                            // widget.updateLocationAndSize({ x: e.data.x, y: e.data.y, width: e.data.width, height: e.data.height }, { imageMap: true });
                            // widget.updateStyle(e.data);
                            widget.render();
                            wm.addWidget(widget);
                            if (typeof widget.keyCode === "function" && widget.keyCode() && widget.type() === "button") {
                                wm._keyCode2widget[widget.keyCode()] = widget;
                            }
                            event.action = "create";
                            event.widget = widget;
                            wm.fire(event);
                        }
                    }).on("cancel", function (e, view) {
                        view.remove();
                        d3.select(region.node().parentNode).remove();
                    });
            }).on("resize", function (e) {
                wm.updateLocationAndSize(e.region.attr("id"), e.pos, e.scale);
                event.action = "resize";
                event.widget = wm.getWidget(e.region.attr("id"));
                wm.fire(event);
            }).on("move", function (e) {
                wm.updateLocationAndSize(e.region.attr("id"), e.pos, e.scale);
                event.action = "move";
                event.widget = wm.getWidget(e.region.attr("id"));
                wm.fire(event);
            }).on("remove", function (e) {
                event.widget = wm.getWidget(e.regions.node().id);
                e.regions.each(function () {
                    var w = wm.getWidget(d3.select(this).attr("id"));
                    if (w) {
                        wm.removeWidget(w);
                        w.remove();
                    } else {
                        d3.select(this.parentNode).remove();
                    }
                });
                event.action = "remove";
                wm.fire(event);
            }).on("select", function (e) {
                wm.fire({type: "WidgetSelected", widget: wm.getWidget(e.region.attr("id")), event: e.event});
            }).on("clearselection", function (e) {
                var widgets = [];
                e.regions.each(function () {
                    widgets.push(wm.getWidget(d3.select(this).attr("id")));
                });
                wm.fire({type: "WidgetSelectionCleared", widgets: widgets, event: e.event});
            });
            if (cb) { cb(); }
        }});
    };

    /**
        Get the current map creator
        @memberof WidgetManager
     */
    WidgetManager.prototype.mapCreator = function () {
        return mapCreator;
    };

    /**
        Clears the widget areas on the interface.
        @memberof WidgetManager
     */
    WidgetManager.prototype.clearWidgetAreas = function () {
        //clear old widhget maps and area def
        if (this.mapCreator()) {
            this.mapCreator().clear();
        }
        this.clearWidgets();
    };
    /**
        Gets the widget with the specified id.
        @param {string} id The html element id of the widget
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.getWidget = function (id) {
        return this._widgets[id];
    };
    /**
        Adds the specified widget to the list of widgets.
        @param {Widget} widget The widget to be added.
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.addWidget = function (widget) {
        this._widgets[widget.id()] = widget;
    };
    WidgetManager.prototype.addWallClockTimer = function () {
        //pop up the timer edit dialog
        var id = "tick";
        var timerRate = Preferences.get(PreferenceKeys.WALL_CLOCK_INTERVAL) * 1000;
        var emuTimer = new EmuTimer(id, { timerEvent: id, timerRate: timerRate, callback: renderResponse });
        this._timers[emuTimer.id()] = emuTimer;
        // fire event widget created
        var event = { type: "TimerModified", action: "create", timer: emuTimer };
        wm.fire(event);

    };
    WidgetManager.prototype.editTimer = function (emuTimer) {
        handleTimerEdit(emuTimer, wm);
    };

    /**
        Edits the specified widget.
        @param {Widget} widget The widget to be edited.
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.editWidget = function (widget) {
        handleWidgetEdit(widget, wm);
    };
    WidgetManager.prototype.editTimer = function (emuTimer) {
        // the only timer type supported in the current implementation is EmuTimer
        handleTimerEdit(emuTimer, wm);
    };
    WidgetManager.prototype.startTimers = function () {
        _.each(this._timers, function (timer) {
            timer.start();
        });
    };
    WidgetManager.prototype.stopTimers = function () {
        _.each(this._timers, function (timer) {
            timer.stop();
        });
    };
    /**
        Removes the specified widget from the list of widgets.
        @param {Widget} widget The widget to remove.
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.removeWidget = function (widget) {
        widget.remove();
        delete this._widgets[widget.id()];
    };
    /**
        Gets a list of all display widgets loaded on the page.
        @returns {BasicDisplay[]}
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.getAllDisplays = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "display" || w.type() === "numericdisplay" || w.type() === "touchscreendisplay";
        });
    };
    /**
        Gets a list of all display widgets loaded on the page.
        @returns {BasicDisplay[]}
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.getDisplayWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "display";
        });
    };
    /**
        Gets a list of all display widgets loaded on the page.
        @returns {NumericDisplay[]}
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.getNumericDisplayWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "numericdisplay";
        });
    };
    /**
        Gets a list of all LED widgets loaded on the page.
        @returns {LED[]}
        @memberof module:WidgetManager
     */
    WidgetManager.prototype.getLEDWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "led";
        });
    };
    /**
        Gets a list of all button widgets loaded on the page.
        @returns {Button[]}
        @memberof WidgetManager
     */
    WidgetManager.prototype.getButtonWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "button";
        });
    };
    /**
        Gets a list of all button widgets loaded on the page.
        @returns {TouchscreenButton[]}
        @memberof WidgetManager
     */
    WidgetManager.prototype.getTouchscreenButtonWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "touchscreenbutton";
        });
    };
    /**
        Gets a list of all button widgets loaded on the page.
        @returns {TouchscreenDisplay[]}
        @memberof WidgetManager
     */
    WidgetManager.prototype.getTouchscreenDisplayWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "touchscreendisplay";
        });
    };
    /**
        Gets a list of storyboard widgets
        @returns {Storyboard}
        @memberof WidgetManager
     */
    WidgetManager.prototype.getStoryboardWidgets = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "storyboard";
        });
    };

    /**
        Gets a list of all the widgets loaded on the page. The returned array contains all
        widget types
        @returns {Widget[]}
        @memberof WidgetManager
    */
    WidgetManager.prototype.getAllWidgets = function () {
        // return an array sorted by widget type
        return this.getDisplayWidgets()
            .concat(this.getNumericDisplayWidgets())
            .concat(this.getTouchscreenDisplayWidgets())
            .concat(this.getTouchscreenButtonWidgets())
            .concat(this.getButtonWidgets())
            .concat(this.getLEDWidgets());
    };
    WidgetManager.prototype.getAllTimers = function () {
        return _.filter(this._widgets, function (w) {
            return w.type() === "timer";
        });
    };

    /**
        Update the location and size of the widget by updating the image map coords to the position given.
        @param {Widget} widget The widget to be updated
        @param {{x: number, y: number, width: number, height: number}} pos The new position and size
        @param {Number?} scale a scale factor for the pos value. If not supplied defaults to 1
        @memberof WidgetManager
     */
    WidgetManager.prototype.updateLocationAndSize = function (widget, pos, scale) {
        scale = scale || 1;
        if (typeof widget === "string") { widget = this.getWidget(widget); }
        if (widget) {
            pos.x *= scale;
            pos.y *= scale;
            pos.width *= scale;
            pos.height *= scale;
            widget.updateLocationAndSize(pos, { imageMap: true });
        }
    };
    /**
     * Returns a JSON object representing widget definitions for the currently open project
       @memberof WidgetManager
     */
    WidgetManager.prototype.getWidgetDefinitions = function () {
        var scale = (d3.select("svg > g").node()) ?
                        +(d3.select("svg > g").attr("transform").replace("scale(", "").replace(")", "")) || 1 : 1;
        var widgets = [], regionDefs = [];
        _.each(this._widgets, function (widget) {
            widgets.push(widget.toJSON());
            var a = widget.imageMap();
            if (a) {
                var scaledCoords = a.attr("coords").split(",").map(function (c) {
                    return +c / scale;
                }).join(",");
                regionDefs.push({"class": a.attr("class"), shape: a.attr("shape"),
                            coords: scaledCoords, href: a.attr("href")});
            }
        });
        return {widgetMaps: widgets, regionDefs: regionDefs};
    };

    /**
        Removes all the widgets on the interface
     */
    WidgetManager.prototype.clearWidgets = function () {
        _.each(this._widgets, function (value) {
            value.remove();//remove the widgets from the interface
        });
        this._widgets = {};
    };
    /**
        update all the area maps attributed to all widgets on the project by the given scale factor
        @param {Number} scale the scale to transform the maps by
    */
    WidgetManager.prototype.scaleAreaMaps = function (scale) {
        var _this = this;
        var widgets = _this.getAllWidgets();
        function _getPos(el) {
            return {x: el.attr("x"), y: el.attr("y"), height: el.attr("height"), width: el.attr("width")};
        }
        widgets.forEach(function (w) {
            var pos = _getPos(w.element());
            _this.updateLocationAndSize(w, pos, scale);
        });
    };

    /**
     * @function addStoryboardImages
     * @memberof WidgetManager
     * @param descriptors {Array(Object)} Array of image descriptors. Each image descriptor has the following properties:
     *        <li> type: (String), defines the MIME type of the image. The string starts with "image/", e.g., "image/jpeg" </li>
     *        <li> imagePath: (String), defines the path of the image. The path is relative to the current project folder </li>
     * @returns {Promise(Array({image}))}
     */
    WidgetManager.prototype.addStoryboardImages = function (descriptors) {
        var _this = this;
        var storyboard = this.getStoryboardWidgets() || new Storyboard();
        return new Promise(function (resolve, reject) {
            storyboard.addImages(descriptors).then(function (images) {
                _this.addWidget(storyboard);
                _this.fire({type: "WidgetModified"});
                resolve(images);
            }).catch(function (err) {
                reject(err);
            });
        });
    };

    /**
     * @function displayEditStoryboardDialog
     * @memberof WidgetManager
     */
    WidgetManager.prototype.displayEditStoryboardDialog = function () {
        var _this = this;
        var w = this.getStoryboardWidgets() || [];
        if (w.length === 0) {
            w.push(new Storyboard());
            w[0].addListener("EditStoryboardComplete", function (data) {
                _this.addWidget(data.widget); // this overwrites the widget
                _this.fire({type: "WidgetModified"}); // this marks the widget file as dirty
                _this.fire({type: "StoryboardWidgetModified", widget: data.widget}); // this will trigger an event listener in Project that creates a directory with the storyboard image files
            });
        }
        w[0].displayEditStoryboardDialog();
    };

    module.exports = {
        /**
         * Returns a singleton instance of the WidgetManager
         */
        getWidgetManager: function () {
            if (!wm) {
                wm = new WidgetManager();
            }
            return wm;
        }
    };
});
