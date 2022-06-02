
/*!
 * baguetteBox.js
 * @author  feimosi
 * @version %%INJECT_VERSION%%
 * @url https://github.com/feimosi/baguetteBox.js
 */

/* global define, module */

(function (root, factory) {
    'use strict';
    if (typeof define === 'function' && define.amd) {
        define(factory);
    } else if (typeof exports === 'object') {
        module.exports = factory();
    } else {
        root.baguetteBox = factory();
    }
}(this, function () {
    'use strict';

    // SVG shapes used on the buttons
    var leftArrow = '<svg width="44" height="60">' +
            '<polyline points="30 10 10 30 30 50" stroke="rgba(255,255,255,0.5)" stroke-width="4"' +
              'stroke-linecap="butt" fill="none" stroke-linejoin="round"/>' +
            '</svg>',
        rightArrow = '<svg width="44" height="60">' +
            '<polyline points="14 10 34 30 14 50" stroke="rgba(255,255,255,0.5)" stroke-width="4"' +
              'stroke-linecap="butt" fill="none" stroke-linejoin="round"/>' +
            '</svg>',
        closeX = '<svg width="30" height="30">' +
            '<g stroke="rgb(160,160,160)" stroke-width="4">' +
            '<line x1="5" y1="5" x2="25" y2="25"/>' +
            '<line x1="5" y1="25" x2="25" y2="5"/>' +
            '</g></svg>';
    // Global options and their defaults
    var options = {},
        defaults = {
            captions: true,
            buttons: 'auto',
            fullScreen: false,
            noScrollbars: false,
            bodyClass: 'baguetteBox-open',
            titleTag: false,
            async: false,
            preload: 2,
            animation: 'slideIn',
            afterShow: null,
            afterHide: null,
            onChange: null,
            overlayBackgroundColor: 'rgba(0,0,0,.8)'
        };
    // Object containing information about features compatibility
    var supports = {};
    // DOM Elements references
    var overlay, slider, previousButton, nextButton, closeButton;
    // An array with all images in the current gallery
    var currentGallery = [];
    // Current image index inside the slider
    var currentIndex = 0;
    // Visibility of the overlay
    var isOverlayVisible = false;
    // Touch event start position (for slide gesture)
    var touch = {};
    // If set to true ignore touch events because animation was already fired
    var touchFlag = false;
    // Regex pattern to match image files
    var regex = /.+\.(gif|jpe?g|png|webp)/i;
    // Object of all used galleries
    var data = {};
    // Array containing temporary images DOM elements
    var imagesElements = [];
    // The last focused element before opening the overlay
    var documentLastFocus = null;
    var overlayClickHandler = function(event) {
        // Close the overlay when user clicks directly on the background
        if (event.target.id.indexOf('baguette-img') !== -1) {
            hideOverlay();
        }
    };
    var previousButtonClickHandler = function(event) {
        event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true; // eslint-disable-line no-unused-expressions
        showPreviousImage();
    };
    var nextButtonClickHandler = function(event) {
        event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true; // eslint-disable-line no-unused-expressions
        showNextImage();
    };
    var closeButtonClickHandler = function(event) {
        event.stopPropagation ? event.stopPropagation() : event.cancelBubble = true; // eslint-disable-line no-unused-expressions
        hideOverlay();
    };
    var touchstartHandler = function(event) {
        touch.count++;
        if (touch.count > 1) {
            touch.multitouch = true;
        }
        // Save x and y axis position
        touch.startX = event.changedTouches[0].pageX;
        touch.startY = event.changedTouches[0].pageY;
    };
    var touchmoveHandler = function(event) {
        // If action was already triggered or multitouch return
        if (touchFlag || touch.multitouch) {
            return;
        }
        event.preventDefault ? event.preventDefault() : event.returnValue = false; // eslint-disable-line no-unused-expressions
        var touchEvent = event.touches[0] || event.changedTouches[0];
        // Move at least 40 pixels to trigger the action
        if (touchEvent.pageX - touch.startX > 40) {
            touchFlag = true;
            showPreviousImage();
        } else if (touchEvent.pageX - touch.startX < -40) {
            touchFlag = true;
            showNextImage();
        // Move 100 pixels up to close the overlay
        } else if (touch.startY - touchEvent.pageY > 100) {
            hideOverlay();
        }
    };
    var touchendHandler = function() {
        touch.count--;
        if (touch.count <= 0) {
            touch.multitouch = false;
        }
        touchFlag = false;
    };
    var contextmenuHandler = function() {
        touchendHandler();
    };

    var trapFocusInsideOverlay = function(event) {
        if (overlay.style.display === 'block' && (overlay.contains && !overlay.contains(event.target))) {
            event.stopPropagation();
            initFocus();
        }
    };

    // forEach polyfill for IE8
    // http://stackoverflow.com/a/14827443/1077846
    /* eslint-disable */
    if (![].forEach) {
        Array.prototype.forEach = function(callback, thisArg) {
            for (var i = 0; i < this.length; i++) {
                callback.call(thisArg, this[i], i, this);
            }
        };
    }

    // filter polyfill for IE8
    // https://gist.github.com/eliperelman/1031656
    if (![].filter) {
        Array.prototype.filter = function(a, b, c, d, e) {
            c = this;
            d = [];
            for (e = 0; e < c.length; e++)
                a.call(b, c[e], e, c) && d.push(c[e]);
            return d;
        };
    }
    /* eslint-enable */

    // Script entry point
    function run(selector, userOptions) {
        // Fill supports object
        supports.transforms = testTransformsSupport();
        supports.svg = testSvgSupport();
        supports.passiveEvents = testPassiveEventsSupport();

        buildOverlay();
        removeFromCache(selector);
        return bindImageClickListeners(selector, userOptions);
    }

    function bindImageClickListeners(selector, userOptions) {
        // For each gallery bind a click event to every image inside it
        var galleryNodeList = document.querySelectorAll(selector);
        var selectorData = {
            galleries: [],
            nodeList: galleryNodeList
        };
        data[selector] = selectorData;

        [].forEach.call(galleryNodeList, function(galleryElement) {
            if (userOptions && userOptions.filter) {
                regex = userOptions.filter;
            }

            // Get nodes from gallery elements or single-element galleries
            var tagsNodeList = [];
            if (galleryElement.tagName === 'A') {
                tagsNodeList = [galleryElement];
            } else {
                tagsNodeList = galleryElement.getElementsByTagName('a');
            }

            // Filter 'a' elements from those not linking to images
            tagsNodeList = [].filter.call(tagsNodeList, function(element) {
                if (element.className.indexOf(userOptions && userOptions.ignoreClass) === -1) {
                    return regex.test(element.href);
                }
            });
            if (tagsNodeList.length === 0) {
                return;
            }

            var gallery = [];
            [].forEach.call(tagsNodeList, function(imageElement, imageIndex) {
                var imageElementClickHandler = function(event) {
                    event.preventDefault ? event.preventDefault() : event.returnValue = false; // eslint-disable-line no-unused-expressions
                    prepareOverlay(gallery, userOptions);
                    showOverlay(imageIndex);
                };
                var imageItem = {
                    eventHandler: imageElementClickHandler,
                    imageElement: imageElement
                };
                bind(imageElement, 'click', imageElementClickHandler);
                gallery.push(imageItem);
            });
            selectorData.galleries.push(gallery);
        });

        return selectorData.galleries;
    }

    function clearCachedData() {
        for (var selector in data) {
            if (data.hasOwnProperty(selector)) {
                removeFromCache(selector);
            }
        }
    }

    function removeFromCache(selector) {
        if (!data.hasOwnProperty(selector)) {
            return;
        }
        var galleries = data[selector].galleries;
        [].forEach.call(galleries, function(gallery) {
            [].forEach.call(gallery, function(imageItem) {
                unbind(imageItem.imageElement, 'click', imageItem.eventHandler);
            });

            if (currentGallery === gallery) {
                currentGallery = [];
            }
        });

        delete data[selector];
    }

    function buildOverlay() {
        overlay = getByID('baguetteBox-overlay');
        // Check if the overlay already exists
        if (overlay) {
            slider = getByID('baguetteBox-slider');
            previousButton = getByID('previous-button');
            nextButton = getByID('next-button');
            closeButton = getByID('close-button');
            return;
        }
        // Create overlay element
        overlay = create('div');
        overlay.setAttribute('role', 'dialog');
        overlay.id = 'baguetteBox-overlay';
        document.getElementsByTagName('body')[0].appendChild(overlay);
        // Create gallery slider element
        slider = create('div');
        slider.id = 'baguetteBox-slider';
        overlay.appendChild(slider);
        // Create all necessary buttons
        previousButton = create('button');
        previousButton.setAttribute('type', 'button');
        previousButton.id = 'previous-button';
        previousButton.setAttribute('aria-label', 'Previous');
        previousButton.innerHTML = supports.svg ? leftArrow : '&lt;';
        overlay.appendChild(previousButton);

        nextButton = create('button');
        nextButton.setAttribute('type', 'button');
        nextButton.id = 'next-button';
        nextButton.setAttribute('aria-label', 'Next');
        nextButton.innerHTML = supports.svg ? rightArrow : '&gt;';
        overlay.appendChild(nextButton);

        closeButton = create('button');
        closeButton.setAttribute('type', 'button');
        closeButton.id = 'close-button';
        closeButton.setAttribute('aria-label', 'Close');
        closeButton.innerHTML = supports.svg ? closeX : '&times;';
        overlay.appendChild(closeButton);

        previousButton.className = nextButton.className = closeButton.className = 'baguetteBox-button';

        bindEvents();
    }

    function keyDownHandler(event) {
        switch (event.keyCode) {
        case 37: // Left arrow
            showPreviousImage();
            break;
        case 39: // Right arrow
            showNextImage();
            break;
        case 27: // Esc
            hideOverlay();
            break;
        case 36: // Home
            showFirstImage(event);
            break;
        case 35: // End
            showLastImage(event);
            break;
        }
    }

    function bindEvents() {
        var options = supports.passiveEvents ? { passive: true } : null;
        bind(overlay, 'click', overlayClickHandler);
        bind(previousButton, 'click', previousButtonClickHandler);
        bind(nextButton, 'click', nextButtonClickHandler);
        bind(closeButton, 'click', closeButtonClickHandler);
        bind(slider, 'contextmenu', contextmenuHandler);
        bind(overlay, 'touchstart', touchstartHandler, options);
        bind(overlay, 'touchmove', touchmoveHandler, options);
        bind(overlay, 'touchend', touchendHandler);
        bind(document, 'focus', trapFocusInsideOverlay, true);
    }

    function unbindEvents() {
        var options = supports.passiveEvents ? { passive: true } : null;
        unbind(overlay, 'click', overlayClickHandler);
        unbind(previousButton, 'click', previousButtonClickHandler);
        unbind(nextButton, 'click', nextButtonClickHandler);
        unbind(closeButton, 'click', closeButtonClickHandler);
        unbind(slider, 'contextmenu', contextmenuHandler);
        unbind(overlay, 'touchstart', touchstartHandler, options);
        unbind(overlay, 'touchmove', touchmoveHandler, options);
        unbind(overlay, 'touchend', touchendHandler);
        unbind(document, 'focus', trapFocusInsideOverlay, true);
    }

    function prepareOverlay(gallery, userOptions) {
        // If the same gallery is being opened prevent from loading it once again
        if (currentGallery === gallery) {
            return;
        }
        currentGallery = gallery;
        // Update gallery specific options
        setOptions(userOptions);
        // Empty slider of previous contents (more effective than .innerHTML = "")
        while (slider.firstChild) {
            slider.removeChild(slider.firstChild);
        }
        imagesElements.length = 0;

        var imagesFiguresIds = [];
        var imagesCaptionsIds = [];
        // Prepare and append images containers and populate figure and captions IDs arrays
        for (var i = 0, fullImage; i < gallery.length; i++) {
            fullImage = create('div');
            fullImage.className = 'full-image';
            fullImage.id = 'baguette-img-' + i;
            imagesElements.push(fullImage);

            imagesFiguresIds.push('baguetteBox-figure-' + i);
            imagesCaptionsIds.push('baguetteBox-figcaption-' + i);
            slider.appendChild(imagesElements[i]);
        }
        overlay.setAttribute('aria-labelledby', imagesFiguresIds.join(' '));
        overlay.setAttribute('aria-describedby', imagesCaptionsIds.join(' '));
    }

    function setOptions(newOptions) {
        if (!newOptions) {
            newOptions = {};
        }
        // Fill options object
        for (var item in defaults) {
            options[item] = defaults[item];
            if (typeof newOptions[item] !== 'undefined') {
                options[item] = newOptions[item];
            }
        }
        /* Apply new options */
        // Change transition for proper animation
        slider.style.transition = slider.style.webkitTransition = (options.animation === 'fadeIn' ? 'opacity .4s ease' :
            options.animation === 'slideIn' ? '' : 'none');
        // Hide buttons if necessary
        if (options.buttons === 'auto' && ('ontouchstart' in window || currentGallery.length === 1)) {
            options.buttons = false;
        }
        // Set buttons style to hide or display them
        previousButton.style.display = nextButton.style.display = (options.buttons ? '' : 'none');
        // Set overlay color
        try {
            overlay.style.backgroundColor = options.overlayBackgroundColor;
        } catch (e) {
            // Silence the error and continue
        }
    }

    function showOverlay(chosenImageIndex) {
        if (options.noScrollbars) {
            document.documentElement.style.overflowY = 'hidden';
            document.body.style.overflowY = 'scroll';
        }
        if (overlay.style.display === 'block') {
            return;
        }

        bind(document, 'keydown', keyDownHandler);
        currentIndex = chosenImageIndex;
        touch = {
            count: 0,
            startX: null,
            startY: null
        };
        loadImage(currentIndex, function() {
            preloadNext(currentIndex);
            preloadPrev(currentIndex);
        });

        updateOffset();
        overlay.style.display = 'block';
        if (options.fullScreen) {
            enterFullScreen();
        }
        // Fade in overlay
        setTimeout(function() {
            overlay.className = 'visible';
            if (options.bodyClass && document.body.classList) {
                document.body.classList.add(options.bodyClass);
            }
            if (options.afterShow) {
                options.afterShow();
            }
        }, 50);
        if (options.onChange) {
            options.onChange(currentIndex, imagesElements.length);
        }
        documentLastFocus = document.activeElement;
        initFocus();
        isOverlayVisible = true;
    }

    function initFocus() {
        if (options.buttons) {
            previousButton.focus();
        } else {
            closeButton.focus();
        }
    }

    function enterFullScreen() {
        if (overlay.requestFullscreen) {
            overlay.requestFullscreen();
        } else if (overlay.webkitRequestFullscreen) {
            overlay.webkitRequestFullscreen();
        } else if (overlay.mozRequestFullScreen) {
            overlay.mozRequestFullScreen();
        }
    }

    function exitFullscreen() {
        if (document.exitFullscreen) {
            document.exitFullscreen();
        } else if (document.mozCancelFullScreen) {
            document.mozCancelFullScreen();
        } else if (document.webkitExitFullscreen) {
            document.webkitExitFullscreen();
        }
    }

    function hideOverlay() {
        if (options.noScrollbars) {
            document.documentElement.style.overflowY = 'auto';
            document.body.style.overflowY = 'auto';
        }
        if (overlay.style.display === 'none') {
            return;
        }

        unbind(document, 'keydown', keyDownHandler);
        // Fade out and hide the overlay
        overlay.className = '';
        setTimeout(function() {
            overlay.style.display = 'none';
            if (document.fullscreen) {
                exitFullscreen();
            }
            if (options.bodyClass && document.body.classList) {
                document.body.classList.remove(options.bodyClass);
            }
            if (options.afterHide) {
                options.afterHide();
            }
            documentLastFocus && documentLastFocus.focus();
            isOverlayVisible = false;
        }, 500);
    }

    function loadImage(index, callback) {
        var imageContainer = imagesElements[index];
        var galleryItem = currentGallery[index];

        // Return if the index exceeds prepared images in the overlay
        // or if the current gallery has been changed / closed
        if (typeof imageContainer === 'undefined' || typeof galleryItem === 'undefined') {
            return;
        }

        // If image is already loaded run callback and return
        if (imageContainer.getElementsByTagName('img')[0]) {
            if (callback) {
                callback();
            }
            return;
        }

        // Get element reference, optional caption and source path
        var imageElement = galleryItem.imageElement;
        var thumbnailElement = imageElement.getElementsByTagName('img')[0];
        var imageCaption = typeof options.captions === 'function' ?
            options.captions.call(currentGallery, imageElement) :
            imageElement.getAttribute('data-caption') || imageElement.title;
        var imageSrc = getImageSrc(imageElement);

        // Prepare figure element
        var figure = create('figure');
        figure.id = 'baguetteBox-figure-' + index;
        figure.innerHTML = '<div class="baguetteBox-spinner">' +
            '<div class="baguetteBox-double-bounce1"></div>' +
            '<div class="baguetteBox-double-bounce2"></div>' +
            '</div>';
        // Insert caption if available
        if (options.captions && imageCaption) {
            var figcaption = create('figcaption');
            figcaption.id = 'baguetteBox-figcaption-' + index;
            figcaption.innerHTML = imageCaption;
            figure.appendChild(figcaption);
        }
        imageContainer.appendChild(figure);

        // Prepare gallery img element
        var image = create('img');
        image.onload = function() {
            // Remove loader element
            var spinner = document.querySelector('#baguette-img-' + index + ' .baguetteBox-spinner');
            figure.removeChild(spinner);
            if (!options.async && callback) {
                callback();
            }
        };
        image.setAttribute('src', imageSrc);
        image.alt = thumbnailElement ? thumbnailElement.alt || '' : '';
        if (options.titleTag && imageCaption) {
            image.title = imageCaption;
        }
        figure.appendChild(image);

        // Run callback
        if (options.async && callback) {
            callback();
        }
    }

    // Get image source location, mostly used for responsive images
    function getImageSrc(image) {
        // Set default image path from href
        var result = image.href;
        // If dataset is supported find the most suitable image
        if (image.dataset) {
            var srcs = [];
            // Get all possible image versions depending on the resolution
            for (var item in image.dataset) {
                if (item.substring(0, 3) === 'at-' && !isNaN(item.substring(3))) {
                    srcs[item.replace('at-', '')] = image.dataset[item];
                }
            }
            // Sort resolutions ascending
            var keys = Object.keys(srcs).sort(function(a, b) {
                return parseInt(a, 10) < parseInt(b, 10) ? -1 : 1;
            });
            // Get real screen resolution
            var width = window.innerWidth * window.devicePixelRatio;
            // Find the first image bigger than or equal to the current width
            var i = 0;
            while (i < keys.length - 1 && keys[i] < width) {
                i++;
            }
            result = srcs[keys[i]] || result;
        }
        return result;
    }

    // Return false at the right end of the gallery
    function showNextImage() {
        return show(currentIndex + 1);
    }

    // Return false at the left end of the gallery
    function showPreviousImage() {
        return show(currentIndex - 1);
    }

    // Return false at the left end of the gallery
    function showFirstImage(event) {
        if (event) {
            event.preventDefault();
        }
        return show(0);
    }

    // Return false at the right end of the gallery
    function showLastImage(event) {
        if (event) {
            event.preventDefault();
        }
        return show(currentGallery.length - 1);
    }

    /**
     * Move the gallery to a specific index
     * @param `index` {number} - the position of the image
     * @param `gallery` {array} - gallery which should be opened, if omitted assumes the currently opened one
     * @return {boolean} - true on success or false if the index is invalid
     */
    function show(index, gallery) {
        if (!isOverlayVisible && index >= 0 && index < gallery.length) {
            prepareOverlay(gallery, options);
            showOverlay(index);
            return true;
        }
        if (index < 0) {
            if (options.animation) {
                bounceAnimation('left');
            }
            return false;
        }
        if (index >= imagesElements.length) {
            if (options.animation) {
                bounceAnimation('right');
            }
            return false;
        }

        currentIndex = index;
        loadImage(currentIndex, function() {
            preloadNext(currentIndex);
            preloadPrev(currentIndex);
        });
        updateOffset();

        if (options.onChange) {
            options.onChange(currentIndex, imagesElements.length);
        }

        return true;
    }

    /**
     * Triggers the bounce animation
     * @param {('left'|'right')} direction - Direction of the movement
     */
    function bounceAnimation(direction) {
        slider.className = 'bounce-from-' + direction;
        setTimeout(function() {
            slider.className = '';
        }, 400);
    }

    function updateOffset() {
        var offset = -currentIndex * 100 + '%';
        if (options.animation === 'fadeIn') {
            slider.style.opacity = 0;
            setTimeout(function() {
                supports.transforms ?
                    slider.style.transform = slider.style.webkitTransform = 'translate3d(' + offset + ',0,0)'
                    : slider.style.left = offset;
                slider.style.opacity = 1;
            }, 400);
        } else {
            supports.transforms ?
                slider.style.transform = slider.style.webkitTransform = 'translate3d(' + offset + ',0,0)'
                : slider.style.left = offset;
        }
    }

    // CSS 3D Transforms test
    function testTransformsSupport() {
        var div = create('div');
        return typeof div.style.perspective !== 'undefined' || typeof div.style.webkitPerspective !== 'undefined';
    }

    // Inline SVG test
    function testSvgSupport() {
        var div = create('div');
        div.innerHTML = '<svg/>';
        return (div.firstChild && div.firstChild.namespaceURI) === 'http://www.w3.org/2000/svg';
    }

    // Borrowed from https://github.com/seiyria/bootstrap-slider/pull/680/files
    /* eslint-disable getter-return */
    function testPassiveEventsSupport() {
        var passiveEvents = false;
        try {
            var opts = Object.defineProperty({}, 'passive', {
                get: function() {
                    passiveEvents = true;
                }
            });
            window.addEventListener('test', null, opts);
        } catch (e) { /* Silence the error and continue */ }

        return passiveEvents;
    }
    /* eslint-enable getter-return */

    function preloadNext(index) {
        if (index - currentIndex >= options.preload) {
            return;
        }
        loadImage(index + 1, function() {
            preloadNext(index + 1);
        });
    }

    function preloadPrev(index) {
        if (currentIndex - index >= options.preload) {
            return;
        }
        loadImage(index - 1, function() {
            preloadPrev(index - 1);
        });
    }

    function bind(element, event, callback, options) {
        if (element.addEventListener) {
            element.addEventListener(event, callback, options);
        } else {
            // IE8 fallback
            element.attachEvent('on' + event, function(event) {
                // `event` and `event.target` are not provided in IE8
                event = event || window.event;
                event.target = event.target || event.srcElement;
                callback(event);
            });
        }
    }

    function unbind(element, event, callback, options) {
        if (element.removeEventListener) {
            element.removeEventListener(event, callback, options);
        } else {
            // IE8 fallback
            element.detachEvent('on' + event, callback);
        }
    }

    function getByID(id) {
        return document.getElementById(id);
    }

    function create(element) {
        return document.createElement(element);
    }

    function destroyPlugin() {
        unbindEvents();
        clearCachedData();
        unbind(document, 'keydown', keyDownHandler);
        document.getElementsByTagName('body')[0].removeChild(document.getElementById('baguetteBox-overlay'));
        data = {};
        currentGallery = [];
        currentIndex = 0;
    }

    return {
        run: run,
        show: show,
        showNext: showNextImage,
        showPrevious: showPreviousImage,
        hide: hideOverlay,
        destroy: destroyPlugin
    };
}));

// Dynamic Adapt v.1
// HTML data-da="where(uniq class name),position(digi),when(breakpoint)"
// e.x. data-da="item,2,992"
// Andrikanych Yevhen 2020
// https://www.youtube.com/c/freelancerlifestyle

"use strict";

(function () {
	let originalPositions = [];
	let daElements = document.querySelectorAll('[data-da]');
	let daElementsArray = [];
	let daMatchMedia = [];
	//Заполняем массивы
	if (daElements.length > 0) {
		let number = 0;
		for (let index = 0; index < daElements.length; index++) {
			const daElement = daElements[index];
			const daMove = daElement.getAttribute('data-da');
			if (daMove != '') {
				const daArray = daMove.split(',');
				const daPlace = daArray[1] ? daArray[1].trim() : 'last';
				const daBreakpoint = daArray[2] ? daArray[2].trim() : '767';
				const daType = daArray[3] === 'min' ? daArray[3].trim() : 'max';
				const daDestination = document.querySelector('.' + daArray[0].trim())
				if (daArray.length > 0 && daDestination) {
					daElement.setAttribute('data-da-index', number);
					//Заполняем массив первоначальных позиций
					originalPositions[number] = {
						"parent": daElement.parentNode,
						"index": indexInParent(daElement)
					};
					//Заполняем массив элементов 
					daElementsArray[number] = {
						"element": daElement,
						"destination": document.querySelector('.' + daArray[0].trim()),
						"place": daPlace,
						"breakpoint": daBreakpoint,
						"type": daType
					}
					number++;
				}
			}
		}
		dynamicAdaptSort(daElementsArray);

		//Создаем события в точке брейкпоинта
		for (let index = 0; index < daElementsArray.length; index++) {
			const el = daElementsArray[index];
			const daBreakpoint = el.breakpoint;
			const daType = el.type;

			daMatchMedia.push(window.matchMedia("(" + daType + "-width: " + daBreakpoint + "px)"));
			daMatchMedia[index].addListener(dynamicAdapt);
		}
	}
	//Основная функция
	function dynamicAdapt(e) {
		for (let index = 0; index < daElementsArray.length; index++) {
			const el = daElementsArray[index];
			const daElement = el.element;
			const daDestination = el.destination;
			const daPlace = el.place;
			const daBreakpoint = el.breakpoint;
			const daClassname = "_dynamic_adapt_" + daBreakpoint;

			if (daMatchMedia[index].matches) {
				//Перебрасываем элементы
				if (!daElement.classList.contains(daClassname)) {
					let actualIndex = indexOfElements(daDestination)[daPlace];
					if (daPlace === 'first') {
						actualIndex = indexOfElements(daDestination)[0];
					} else if (daPlace === 'last') {
						actualIndex = indexOfElements(daDestination)[indexOfElements(daDestination).length];
					}
					daDestination.insertBefore(daElement, daDestination.children[actualIndex]);
					daElement.classList.add(daClassname);
				}
			} else {
				//Возвращаем на место
				if (daElement.classList.contains(daClassname)) {
					dynamicAdaptBack(daElement);
					daElement.classList.remove(daClassname);
				}
			}
		}
		customAdapt();
	}

	//Вызов основной функции
	dynamicAdapt();

	//Функция возврата на место
	function dynamicAdaptBack(el) {
		const daIndex = el.getAttribute('data-da-index');
		const originalPlace = originalPositions[daIndex];
		const parentPlace = originalPlace['parent'];
		const indexPlace = originalPlace['index'];
		const actualIndex = indexOfElements(parentPlace, true)[indexPlace];
		parentPlace.insertBefore(el, parentPlace.children[actualIndex]);
	}
	//Функция получения индекса внутри родителя
	function indexInParent(el) {
		var children = Array.prototype.slice.call(el.parentNode.children);
		return children.indexOf(el);
	}
	//Функция получения массива индексов элементов внутри родителя 
	function indexOfElements(parent, back) {
		const children = parent.children;
		const childrenArray = [];
		for (let i = 0; i < children.length; i++) {
			const childrenElement = children[i];
			if (back) {
				childrenArray.push(i);
			} else {
				//Исключая перенесенный элемент
				if (childrenElement.getAttribute('data-da') == null) {
					childrenArray.push(i);
				}
			}
		}
		return childrenArray;
	}
	//Сортировка объекта
	function dynamicAdaptSort(arr) {
		arr.sort(function (a, b) {
			if (a.breakpoint > b.breakpoint) { return -1 } else { return 1 }
		});
		arr.sort(function (a, b) {
			if (a.place > b.place) { return 1 } else { return -1 }
		});
	}
	//Дополнительные сценарии адаптации
	function customAdapt() {
		//const viewport_width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
	}
}());

/*
let block = document.querySelector('.click');
block.addEventListener("click", function (e) {
	alert('Все ок ;)');
});
*/

/*
//Объявляем переменные
const parent_original = document.querySelector('.content__blocks_city');
const parent = document.querySelector('.content__column_river');
const item = document.querySelector('.content__block_item');

//Слушаем изменение размера экрана
window.addEventListener('resize', move);

//Функция
function move(){
	const viewport_width = Math.max(document.documentElement.clientWidth, window.innerWidth || 0);
	if (viewport_width <= 992) {
		if (!item.classList.contains('done')) {
			parent.insertBefore(item, parent.children[2]);
			item.classList.add('done');
		}
	} else {
		if (item.classList.contains('done')) {
			parent_original.insertBefore(item, parent_original.children[2]);
			item.classList.remove('done');
		}
	}
}

//Вызываем функцию
move();
123
*/


//Adaptive functions
	let move_array=[];
if($('*[data-move]')){
	$.each($('*[data-move]'), function(index, val) {
		if($(this).data('move')!='' && $(this).data('move')!=null){
			$(this).attr('data-move-index',index);
			move_array[index]={
				'parent':$(this).parent(),
				"index":$(this).index()
			};
		}
	});
}
function dynamic_adaptive(){
		let w=$(window).outerWidth();
	$.each($('*[data-move]'), function(index, val) {
		if($(this).data('move')!='' && $(this).data('move')!=null){
				let dat_array=$(this).data('move').split(',');
				let dat_parent=$('.'+dat_array[0]);
				let dat_index=dat_array[1];
				let dat_bp=dat_array[2];
			if(w<dat_bp){
				if(!$(this).hasClass('js-move_done_'+dat_bp)){
					if(dat_index>0){
						$(this).insertAfter(dat_parent.find('*').eq(dat_index-1));
					}else{
						$(this).prependTo(dat_parent);
					}
					$(this).addClass('js-move_done_'+dat_bp);
				}
			}else{
				if($(this).hasClass('js-move_done_'+dat_bp)){
					dynamic_adaptive_back($(this));
					$(this).removeClass('js-move_done_'+dat_bp);
				}
			}
		}
	});
}
function dynamic_adaptive_back(el){
		let index_original=el.data('move-index');
		let move_place=move_array[index_original];
		let parent_place=move_place['parent'];
		let index_place=move_place['index'];
	if(index_place>0){
		el.insertAfter(parent_place.find('*').eq(index_place-1));
	}else{
		el.prependTo(parent_place);
	}
}
$(window).resize(function(event) {
	dynamic_adaptive();
});
	dynamic_adaptive();

//console.log(move_array);

/*
function dynamic_adaptive_back_all(){
	$.each($('*[data-move]'), function(index, val) {
			let index_original=$(this).data('move-index');
			let move_place=move_array[index_original];
			let parent_place=move_place['parent'];
			let index_place=move_place['index'];
		if(index_place>0){
			$(this).insertAfter(parent_place.find('*').eq(index_place-1));
		}else{
			$(this).prependTo(parent_place);
		}
	});
}
*/
// const popupLinks = document.querySelectorAll('.popup-link');
// const body = document.querySelector('body');
// const lockPadding = document.querySelectorAll(".lock-padding");

// let unlock = true;

// const timeout = 800;

// if (popupLinks.length > 0) {
// 	for (let index = 0; index < popupLinks.length; index++) {
// 		const popupLink = popupLinks[index];
// 		popupLink.addEventListener("click", function (e) {
// 			const popupName = popupLink.getAttribute('href').replace('#', '');
// 			const curentPopup = document.getElementById(popupName);
// 			popupOpen(curentPopup);
// 			e.preventDefault();
// 		});
// 	}
// }
// const popupCloseIcon = document.querySelectorAll('.close-popup');
// if (popupCloseIcon.length > 0) {
// 	for (let index = 0; index < popupCloseIcon.length; index++) {
// 		const el = popupCloseIcon[index];
// 		el.addEventListener('click', function (e) {
// 			popupClose(el.closest('.popup'));
// 			e.preventDefault();
// 		});
// 	}
// }

// function popupOpen(curentPopup) {
// 	if (curentPopup && unlock) {
// 		const popupActive = document.querySelector('.popup.open');
// 		if (popupActive) {
// 			popupClose(popupActive, false);
// 		} else {
// 			bodyLock();
// 		}
// 		curentPopup.classList.add('open');
// 		curentPopup.addEventListener("click", function (e) {
// 			if (!e.target.closest('.popup__content')) {
// 				popupClose(e.target.closest('.popup'));
// 			}
// 		});
// 	}
// }

// function popupClose(popupActive, doUnlock = true) {
// 	if (unlock) {
// 		popupActive.classList.remove('open');
// 		if (doUnlock) {
// 			bodyUnLock();
// 		}
// 	}
// }

// function bodyLock() {
// 	const lockPaddingValue = window.innerWidth - document.querySelector('.wrapper').offsetWidth + 'px';

// 	if (lockPadding.length > 0) {
// 		for (let index = 0; index < lockPadding.length; index++) {
// 			const el = lockPadding[index];
// 			el.style.paddingRight = lockPaddingValue;
// 		}
// 	}
// 	body.style.paddingRight = lockPaddingValue;
// 	body.classList.add('lock');

// 	unlock = false;
// 	setTimeout(function () {
// 		unlock = true;
// 	}, timeout);
// }

// function bodyUnLock() {
// 	setTimeout(function () {
// 		if (lockPadding.length > 0) {
// 			for (let index = 0; index < lockPadding.length; index++) {
// 				const el = lockPadding[index];
// 				el.style.paddingRight = '0px';
// 			}
// 		}
// 		body.style.paddingRight = '0px';
// 		body.classList.remove('lock');
// 	}, timeout);

// 	unlock = false;
// 	setTimeout(function () {
// 		unlock = true;
// 	}, timeout);
// }

// document.addEventListener('keydown', function (e) {
// 	if (e.which === 27) {
// 		const popupActive = document.querySelector('.popup.open');
// 		popupClose(popupActive);
// 	}
// });

// (function () {
// 	// проверяем поддержку
// 	if (!Element.prototype.closest) {
// 		// реализуем
// 		Element.prototype.closest = function (css) {
// 			var node = this;
// 			while (node) {
// 				if (node.matches(css)) return node;
// 				else node = node.parentElement;
// 			}
// 			return null;
// 		};
// 	}
// })();
// (function () {
// 	// проверяем поддержку
// 	if (!Element.prototype.matches) {
// 		// определяем свойство
// 		Element.prototype.matches = Element.prototype.matchesSelector ||
// 			Element.prototype.webkitMatchesSelector ||
// 			Element.prototype.mozMatchesSelector ||
// 			Element.prototype.msMatchesSelector;
// 	}
// })();
