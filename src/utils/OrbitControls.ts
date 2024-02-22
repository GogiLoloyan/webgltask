import { makeObservable, observable } from 'mobx';
import * as THREE from 'three';

class PointersToTouchAdapter {
	touches: any[];

	constructor(pointers: any) {
		this.touches = [];
		for (var key in pointers) {
			var item = pointers[key];
			this.touches.push({
				pageX: item.clientX,
				pageY: item.clientY,
			});
		}
	}

}

// This set of controls performs orbiting, dollying (zooming), and panning.
// Unlike TrackballControls, it maintains the "up" direction object.up (+Y by default).
//
//    Orbit - left mouse / touch: one finger move
//    Zoom - middle mouse, or mousewheel / touch: two finger spread or squish
//    Pan - right mouse, or arrow keys / touch: three finger swipe
export class OrbitControls extends THREE.EventDispatcher<any> {
	object: any;
	domElement: Element | Document;

	// Set to false to disable this control
	enabled = true;
	// "target" sets the location of focus, where the object orbits around
	target = new THREE.Vector3();

	// How far you can dolly in and out ( PerspectiveCamera only )
	minDistance = 0;
	maxDistance = Infinity;

	// How far you can zoom in and out ( OrthographicCamera only )
	minZoom = 0;
	maxZoom = Infinity;

	// How far you can orbit vertically, upper and lower limits.
	// Range is 0 to Math.PI radians.
	minPolarAngle = 0; // radians
	maxPolarAngle = Math.PI; // radians

	// How far you can orbit horizontally, upper and lower limits.
	// If set, must be a sub-interval of the interval [ - Math.PI, Math.PI ].
	minAzimuthAngle = -Infinity; // radians
	maxAzimuthAngle = Infinity; // radians

	// Set to true to enable damping (inertia)
	// If damping is enabled, you must call controls.update() in your animation loop
	enableDamping = false;
	dampingFactor = 0.25;

	// This option actually enables dollying in and out; left as "zoom" for backwards compatibility.
	// Set to false to disable zooming
	enableZoom = true;
	zoomSpeed = 1.0;
	mobileZoomFactor = 1.0; //increase mobileZoomFactor to slow zooming 

	// Set to false to disable rotating
	enableRotate = true;
	rotateSpeed = 1.0;

	// Set to false to disable panning
	enablePan = true;
	keyPanSpeed = 7.0; // pixels moved per arrow key push

	// Set to true to automatically rotate around the target
	// If auto-rotate is enabled, you must call controls.update() in your animation loop
	@observable autoRotate = false;
	autoRotateSpeed = 2.0; // 30 seconds per round when fps is 60

	// Set to false to disable use of the keys
	enableKeys = true;

	// The four arrow keys
	keys = {
		LEFT: 37,
		UP: 38,
		RIGHT: 39,
		BOTTOM: 40
	};

	// Mouse buttons
	mouseButtons = {
		ORBIT: THREE.MOUSE.LEFT,
		ZOOM: THREE.MOUSE.MIDDLE,
		PAN: THREE.MOUSE.RIGHT
	};

	// for reset
	target0: THREE.Vector3;
	position0: any;
	zoom0: number;

	//
	// internals
	//
	#changeEvent = {
		type: 'change'
	};
	#startEvent = {
		type: 'start'
	};
	#endEvent = {
		type: 'end'
	};
	#STATE = {
		NONE: -1,
		ROTATE: 0,
		DOLLY: 1,
		PAN: 2,
		TOUCH_ROTATE: 3,
		TOUCH_DOLLY: 4,
		TOUCH_PAN: 5
	};
	#state = -1;
	#EPS = 0.000001;
	// current position in spherical coordinates
	#spherical = new THREE.Spherical();
	#sphericalDelta = new THREE.Spherical();
	#scale = 1;
	#panOffset = new THREE.Vector3();
	#zoomChanged = false;
	#rotateStart = new THREE.Vector2();
	#rotateEnd = new THREE.Vector2();
	#rotateDelta = new THREE.Vector2();
	#panStart = new THREE.Vector2();
	#panEnd = new THREE.Vector2();
	#panDelta = new THREE.Vector2();
	#dollyStart = new THREE.Vector2();
	#dollyEnd = new THREE.Vector2();
	#dollyDelta = new THREE.Vector2();
	#referenceWidth = 575;
	#referenceHeight = 625

	update: any;

	constructor(object: any, domElement: Element | Document) {
		super()
		this.object = object;
		this.domElement = domElement ?? document;

		// for reset
		this.target0 = this.target.clone();
		this.position0 = this.object.position.clone();
		this.zoom0 = this.object.zoom;

		this.update = this.#createUpdate()

		// init
		this.domElement.addEventListener('contextmenu', this.onContextMenu, false);
		this.domElement.addEventListener('mousedown', this.onMouseDown, false);
		this.domElement.addEventListener('wheel', this.onMouseWheel, false);
		this.domElement.addEventListener('touchstart', this.onTouchStart, false);
		this.domElement.addEventListener('touchend', this.onTouchEnd, false);
		this.domElement.addEventListener('touchmove', this.onTouchMove, false);
		console.log('ontouchstart detection: ')
		console.log('ontouchstart' in window);
		if (!('ontouchstart' in window)) {
			this.domElement.addEventListener('pointerdown', this.onPointerDown, false);
			this.domElement.addEventListener('pointermove', this.onPointerMove, false);
			this.domElement.addEventListener('pointerup', this.releasePointer, false);
			this.domElement.addEventListener('pointerout', this.releasePointer, false);
			this.domElement.addEventListener('pointerleave', this.releasePointer, false);
			this.domElement.addEventListener('pointercancel', this.releasePointer, false);
		}
		window.addEventListener('keydown', this.onKeyDown, false);
		// force an update at start
		this.update();

		makeObservable(this)
	}

	isZoomValid = (scale?: number) => {
		return true;
	};

	cameraRotatedEvent = () => { };

	cameraMovedEvent = () => { };

	//
	// public methods
	//
	getSphericalRadius = () => {
		return this.#spherical.radius;
	}

	setSphericalRadius = (value: number) => {
		var factor = value / this.#spherical.radius;
		this.#scale = factor;
		this.update();
	}
	getPolarAngle = () => {
		return this.#spherical.phi;
	};
	getAzimuthalAngle = () => {
		return this.#spherical.theta;
	};
	reset = () => {
		this.target.copy(this.target0);
		this.object.position.copy(this.position0);
		this.object.zoom = this.zoom0;
		this.object.updateProjectionMatrix();
		this.dispatchEvent(this.#changeEvent);
		this.update();
		this.#state = this.#STATE.NONE;
	};

	#createUpdate = () => {
		var offset = new THREE.Vector3();
		// so camera.up is the orbit axis
		var quat = new THREE.Quaternion().setFromUnitVectors(this.object.up, new THREE.Vector3(0, 1, 0));
		var quatInverse = quat.clone().invert();
		var lastPosition = new THREE.Vector3();
		var lastQuaternion = new THREE.Quaternion();
		const scope = this;

		return function update() {
			var position = scope.object.position;
			offset.copy(position).sub(scope.target);
			// rotate offset to "y-axis-is-up" space
			offset.applyQuaternion(quat);
			// angle from z-axis around y-axis
			scope.#spherical.setFromVector3(offset);
			if (scope.autoRotate && scope.#state === scope.#STATE.NONE) {
				scope.rotateLeft(scope.getAutoRotationAngle());
			}
			scope.#spherical.theta += scope.#sphericalDelta.theta;
			scope.#spherical.phi += scope.#sphericalDelta.phi;
			// restrict theta to be between desired limits
			scope.#spherical.theta = Math.max(scope.minAzimuthAngle, Math.min(scope.maxAzimuthAngle, scope.#spherical.theta));
			// restrict phi to be between desired limits
			scope.#spherical.phi = Math.max(scope.minPolarAngle, Math.min(scope.maxPolarAngle, scope.#spherical.phi));
			scope.#spherical.makeSafe();
			scope.#spherical.radius *= scope.#scale;
			// restrict radius to be between desired limits
			scope.#spherical.radius = Math.max(scope.minDistance, Math.min(scope.maxDistance, scope.#spherical.radius));
			// move target to panned location
			scope.target.add(scope.#panOffset);
			offset.setFromSpherical(scope.#spherical);
			// rotate offset back to "camera-up-vector-is-up" space
			offset.applyQuaternion(quatInverse);
			position.copy(scope.target).add(offset);
			scope.object.lookAt(scope.target);
			if (scope.enableDamping === true) {
				scope.#sphericalDelta.theta *= (1 - scope.dampingFactor);
				scope.#sphericalDelta.phi *= (1 - scope.dampingFactor);
			} else {
				scope.#sphericalDelta.set(0, 0, 0);
			}
			scope.#scale = 1;
			scope.#panOffset.set(0, 0, 0);
			// update condition is:
			// min(camera displacement, camera rotation in radians)^2 > EPS
			// using small-angle approximation cos(x/2) = 1 - x^2 / 8
			if (scope.#zoomChanged || lastPosition.distanceToSquared(scope.object.position) > scope.#EPS || 8 * (1 - lastQuaternion.dot(scope.object.quaternion)) > scope.#EPS) {
				scope.dispatchEvent(scope.#changeEvent);
				lastPosition.copy(scope.object.position);
				lastQuaternion.copy(scope.object.quaternion);
				scope.#zoomChanged = false;
				return true;
			}
			return false;
		};
	};

	dispose = () => {
		this.domElement.removeEventListener('contextmenu', this.onContextMenu, false);
		this.domElement.removeEventListener('mousedown', this.onMouseDown, false);
		this.domElement.removeEventListener('wheel', this.onMouseWheel, false);
		this.domElement.removeEventListener('touchstart', this.onTouchStart, false);
		this.domElement.removeEventListener('touchend', this.onTouchEnd, false);
		this.domElement.removeEventListener('touchmove', this.onTouchMove, false);
		if (!('ontouchstart' in window)) {
			this.domElement.removeEventListener('pointerdown', this.onPointerDown, false);
			this.domElement.removeEventListener('pointermove', this.onPointerMove, false);
			this.domElement.removeEventListener('pointerup', this.releasePointer, false);
			this.domElement.removeEventListener('pointerout', this.releasePointer, false);
			this.domElement.removeEventListener('pointerleave', this.releasePointer, false);
			this.domElement.removeEventListener('pointercancel', this.releasePointer, false);
		}
		document.removeEventListener('mousemove', this.onMouseMove, false);
		document.removeEventListener('mouseup', this.onMouseUp, false);
		window.removeEventListener('keydown', this.onKeyDown, false);
		//scope.dispatchEvent( { type: 'dispose' } ); // should this be added here?
	};

	getAutoRotationAngle() {
		return 2 * Math.PI / 60 / 60 * this.autoRotateSpeed;
	}

	getZoomScale = () => {
		return Math.pow(0.95, this.zoomSpeed);
	}

	rotateLeft = (angle: number) => {
		this.#sphericalDelta.theta -= angle;
	}

	rotateUp = (angle: number) => {
		this.#sphericalDelta.phi -= angle;
	}

	#panLeft = (() => {
		const scope = this;
		var v = new THREE.Vector3();
		return function panLeft(distance: number, objectMatrix: THREE.Matrix4) {
			v.setFromMatrixColumn(objectMatrix, 0); // get X column of objectMatrix
			v.multiplyScalar(-distance);
			scope.#panOffset.add(v);
		};
	})()

	#panUp = (() => {
		const scope = this;
		var v = new THREE.Vector3();
		return function panUp(distance: number, objectMatrix: THREE.Matrix4) {
			v.setFromMatrixColumn(objectMatrix, 1); // get Y column of objectMatrix
			v.multiplyScalar(distance);
			scope.#panOffset.add(v);
		};
	})()

	// deltaX and deltaY are in pixels; right and down are positive
	pan = (() => {
		const scope = this;
		var offset = new THREE.Vector3();
		return function pan(deltaX: number, deltaY: number) {
			const element = scope.domElement === document ? scope.domElement.body : scope.domElement as Element;
			if (scope.object instanceof THREE.PerspectiveCamera) {
				// perspective
				var position = scope.object.position;
				offset.copy(position).sub(scope.target);
				var targetDistance = offset.length();
				// half of the fov is center to top of screen
				targetDistance *= Math.tan((scope.object.fov / 2) * Math.PI / 180.0);
				// we actually don't use screenWidth, since perspective camera is fixed to screen height
				scope.#panLeft(2 * deltaX * targetDistance / element.clientHeight, scope.object.matrix);
				scope.#panUp(2 * deltaY * targetDistance / element.clientHeight, scope.object.matrix);
			} else if (scope.object instanceof THREE.OrthographicCamera) {
				// orthographic
				scope.#panLeft(deltaX * (scope.object.right - scope.object.left) / scope.object.zoom / element.clientWidth, scope.object.matrix);
				scope.#panUp(deltaY * (scope.object.top - scope.object.bottom) / scope.object.zoom / element.clientHeight, scope.object.matrix);
			} else {
				// camera neither orthographic nor perspective
				console.warn('WARNING: OrbitControls.js encountered an unknown camera type - pan disabled.');
				scope.enablePan = false;
			}
		};
	})()

	#dollyIn = (dollyScale: number) => {
		if (this.object instanceof THREE.PerspectiveCamera) {
			this.#scale /= dollyScale;
		} else if (this.object instanceof THREE.OrthographicCamera) {
			this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom * dollyScale));
			this.object.updateProjectionMatrix();
			this.#zoomChanged = true;
		} else {
			console.warn('WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.');
			this.enableZoom = false;
		}
	}

	#dollyOut = (dollyScale: number) => {
		if (!this.isZoomValid(dollyScale)) return;
		if (this.object instanceof THREE.PerspectiveCamera) {
			this.#scale *= dollyScale;
		} else if (this.object instanceof THREE.OrthographicCamera) {
			this.object.zoom = Math.max(this.minZoom, Math.min(this.maxZoom, this.object.zoom / dollyScale));
			this.object.updateProjectionMatrix();
			this.#zoomChanged = true;
		} else {
			console.warn('WARNING: OrbitControls.js encountered an unknown camera type - dolly/zoom disabled.');
			this.enableZoom = false;
		}
	}

	//
	// event callbacks - update the object state
	//
	handleMouseDownRotate = (event: any) => {
		// console.log( 'handleMouseDownRotate' );
		this.#rotateStart.set(event.clientX, event.clientY);
	}

	handleMouseDownDolly = (event: any) => {
		// console.log( 'handleMouseDownDolly' );
		this.#dollyStart.set(event.clientX, event.clientY);
	}

	handleMouseDownPan = (event: any) => {
		// console.log( 'handleMouseDownPan' );
		this.#panStart.set(event.clientX, event.clientY);
	}

	handleMouseMoveRotate = (event: any) => {
		// console.log( 'handleMouseMoveRotate' );
		this.#rotateEnd.set(event.clientX, event.clientY);
		this.#rotateDelta.subVectors(this.#rotateEnd, this.#rotateStart);
		var element = this.domElement === document ? this.domElement.body : this.domElement;
		// to return threejs behaviour replace referenceWidth by element.clientWidth
		// and referenceHeight by element.clientHeight for the next 2 strings
		// rotating across whole screen goes 360 degrees around
		this.rotateLeft(2 * Math.PI * this.#rotateDelta.x / this.#referenceWidth * this.rotateSpeed);
		// rotating up and down along whole screen attempts to go 360, but limited to 180
		this.rotateUp(2 * Math.PI * this.#rotateDelta.y / this.#referenceWidth * this.rotateSpeed);
		this.#rotateStart.copy(this.#rotateEnd);
		this.update();
		this.cameraRotatedEvent();
	}

	handleMouseMoveDolly = (event: any) => {
		// console.log( 'handleMouseMoveDolly' );
		this.#dollyEnd.set(event.clientX, event.clientY);
		this.#dollyDelta.subVectors(this.#dollyEnd, this.#dollyStart);
		if (this.#dollyDelta.y > 0) {
			this.#dollyIn(this.getZoomScale());
		} else if (this.#dollyDelta.y < 0) {
			this.#dollyOut(this.getZoomScale());
		}
		this.#dollyStart.copy(this.#dollyEnd);
		this.update();
	}

	handleMouseMovePan = (event: any) => {
		// console.log( 'handleMouseMovePan' );
		this.#panEnd.set(event.clientX, event.clientY);
		this.#panDelta.subVectors(this.#panEnd, this.#panStart);
		this.pan(this.#panDelta.x, this.#panDelta.y);
		this.#panStart.copy(this.#panEnd);
		this.update();
	}

	handleMouseUp = (event: any) => {
		// console.log( 'handleMouseUp' );
	}


	handleMouseWheel = (event: any) => {
		// console.log( 'handleMouseWheel' );
		if (event.deltaY < 0) {
			this.#dollyOut(this.getZoomScale());
		} else if (event.deltaY > 0) {
			this.#dollyIn(this.getZoomScale());
		}
		this.update();
		this.cameraMovedEvent();
	}

	handleKeyDown = (event: any) => {
		// console.log( 'handleKeyDown' );
		switch (event.keyCode) {
			case this.keys.UP:
				this.pan(0, this.keyPanSpeed);
				this.update();
				break;
			case this.keys.BOTTOM:
				this.pan(0, -this.keyPanSpeed);
				this.update();
				break;
			case this.keys.LEFT:
				this.pan(this.keyPanSpeed, 0);
				this.update();
				break;
			case this.keys.RIGHT:
				this.pan(-this.keyPanSpeed, 0);
				this.update();
				break;
		}
	}

	handleTouchStartRotate = (event: any) => {
		// console.log( 'handleTouchStartRotate' );
		this.#rotateStart.set(event.touches[0].pageX, event.touches[0].pageY);
	}

	handleTouchStartDolly = (event: any) => {
		// console.log( 'handleTouchStartDolly' );
		var dx = event.touches[0].pageX - event.touches[1].pageX;
		var dy = event.touches[0].pageY - event.touches[1].pageY;
		var distance = Math.sqrt(dx * dx + dy * dy);
		this.#dollyStart.set(0, distance);
	}

	handleTouchStartPan = (event: any) => {
		// console.log( 'handleTouchStartPan' );
		this.#panStart.set(event.touches[0].pageX, event.touches[0].pageY);
	}

	handleTouchMoveRotate = (event: any) => {
		// console.log( 'handleTouchMoveRotate' );
		this.#rotateEnd.set(event.touches[0].pageX, event.touches[0].pageY);
		this.#rotateDelta.subVectors(this.#rotateEnd, this.#rotateStart);
		var element = this.domElement === document ? this.domElement.body : this.domElement;
		//to return threejs behaviour replace referenceWidth by element.clientWidth
		// and referenceHeight by element.clientHeight for the next 2 strings
		// rotating across whole screen goes 360 degrees around
		this.rotateLeft(2 * Math.PI * this.#rotateDelta.x / this.#referenceWidth * this.rotateSpeed);
		// rotating up and down along whole screen attempts to go 360, but limited to 180
		this.rotateUp(2 * Math.PI * this.#rotateDelta.y / this.#referenceHeight * this.rotateSpeed);
		this.#rotateStart.copy(this.#rotateEnd);
		this.update();
		this.cameraRotatedEvent();
	}

	handleTouchMoveDolly = (event: any) => {
		//console.log( 'handleTouchMoveDolly' );
		var dx = event.touches[0].pageX - event.touches[1].pageX;
		var dy = event.touches[0].pageY - event.touches[1].pageY;
		var distance = Math.sqrt(dx * dx + dy * dy);
		this.#dollyEnd.set(0, distance);
		this.#dollyDelta.subVectors(this.#dollyEnd, this.#dollyStart);
		if (this.#dollyDelta.y > 0) {
			this.#dollyOut(this.getZoomScale() * this.mobileZoomFactor);
		} else if (this.#dollyDelta.y < 0) {
			this.#dollyIn(this.getZoomScale() * this.mobileZoomFactor);
		}
		this.#dollyStart.copy(this.#dollyEnd);
		this.update();
		this.cameraMovedEvent();
	}

	handleTouchMovePan = (event: any) => {
		// console.log( 'handleTouchMovePan' );
		this.#panEnd.set(event.touches[0].pageX, event.touches[0].pageY);
		this.#panDelta.subVectors(this.#panEnd, this.#panStart);
		this.pan(this.#panDelta.x, this.#panDelta.y);
		this.#panStart.copy(this.#panEnd);
		this.update();
	}

	handleTouchEnd = (event: any) => {
		//  console.log( 'handleTouchEnd' );
	}

	#pointers: Record<string, any> = {};
	#pointersLength = 0;
	#isZoomGesture = false;

	//
	// event handlers - FSM: listen for events and reset state
	//
	onMouseDown = (event: any) => {
		if (this.enabled === false) return;
		event.preventDefault();
		if (event.button === this.mouseButtons.ORBIT) {
			if (this.enableRotate === false) return;
			this.handleMouseDownRotate(event);
			this.#state = this.#STATE.ROTATE;
		} else if (event.button === this.mouseButtons.ZOOM) {
			if (this.enableZoom === false) return;
			this.handleMouseDownDolly(event);
			this.#state = this.#STATE.DOLLY;
		} else if (event.button === this.mouseButtons.PAN) {
			if (this.enablePan === false) return;
			this.handleMouseDownPan(event);
			this.#state = this.#STATE.PAN;
		}
		if (this.#state !== this.#STATE.NONE) {
			document.addEventListener('mousemove', this.onMouseMove, false);
			document.addEventListener('mouseup', this.onMouseUp, false);
			this.dispatchEvent(this.#startEvent);
		}
	}

	onMouseMove = (event: any) => {
		// console.log('onMouseMove');
		if (this.#isZoomGesture) return;
		if (this.enabled === false) return;
		event.preventDefault();
		if (this.#state === this.#STATE.ROTATE) {
			if (this.enableRotate === false) return;
			this.handleMouseMoveRotate(event);
		} else if (this.#state === this.#STATE.DOLLY) {
			if (this.enableZoom === false) return;
			this.handleMouseMoveDolly(event);
		} else if (this.#state === this.#STATE.PAN) {
			if (this.enablePan === false) return;
			this.handleMouseMovePan(event);
		}
	}

	onMouseUp = (event: any) => {
		if (this.enabled === false) return;
		this.handleMouseUp(event);
		document.removeEventListener('mousemove', this.onMouseMove, false);
		document.removeEventListener('mouseup', this.onMouseUp, false);
		this.dispatchEvent(this.#endEvent);
		this.#state = this.#STATE.NONE;
	}

	onMouseWheel = (event: any) => {
		if (this.enabled === false || this.enableZoom === false || (this.#state !== this.#STATE.NONE && this.#state !== this.#STATE.ROTATE)) return;
		event.preventDefault();
		event.stopPropagation();
		this.handleMouseWheel(event);
		this.dispatchEvent(this.#startEvent); // not sure why these are here...
		this.dispatchEvent(this.#endEvent);
	}

	onKeyDown = (event: any) => {
		if (this.enabled === false || this.enableKeys === false || this.enablePan === false) return;
		this.handleKeyDown(event);
	}

	onTouchStart = (event: any) => {
		//console.log("onTouchStart");
		if (this.enabled === false) return;
		switch (event.touches.length) {
			case 1: // one-fingered touch: rotate
				if (this.enableRotate === false) return;
				this.handleTouchStartRotate(event);
				this.#state = this.#STATE.TOUCH_ROTATE;
				break;
			case 2: // two-fingered touch: dolly
				if (this.enableZoom === false) return;
				this.handleTouchStartDolly(event);
				this.#state = this.#STATE.TOUCH_DOLLY;
				break;
			case 3: // three-fingered touch: pan
				if (this.enablePan === false) return;
				this.handleTouchStartPan(event);
				this.#state = this.#STATE.TOUCH_PAN;
				break;
			default:
				this.#state = this.#STATE.NONE;
		}
		if (this.#state !== this.#STATE.NONE) {
			this.dispatchEvent(this.#startEvent);
		}
	}

	onTouchMove = (event: any) => {
		//console.log("onTouchMove");
		if (this.enabled === false) return;
		event.preventDefault();
		event.stopPropagation();
		switch (event.touches.length) {
			case 1: // one-fingered touch: rotate
				if (this.enableRotate === false) return;
				if (this.#state !== this.#STATE.TOUCH_ROTATE) return; // is this needed?...
				this.handleTouchMoveRotate(event);
				break;
			case 2: // two-fingered touch: dolly
				if (this.enableZoom === false) return;
				if (this.#state !== this.#STATE.TOUCH_DOLLY) return; // is this needed?...
				this.handleTouchMoveDolly(event);
				break;
			case 3: // three-fingered touch: pan
				if (this.enablePan === false) return;
				if (this.#state !== this.#STATE.TOUCH_PAN) return; // is this needed?...
				this.handleTouchMovePan(event);
				break;
			default:
				this.#state = this.#STATE.NONE;
		}
	}

	onTouchEnd = (event: any) => {
		//console.log("onTouchEnd");
		if (this.enabled === false) return;
		this.handleTouchEnd(event);
		this.dispatchEvent(this.#endEvent);
		this.#state = this.#STATE.NONE;
	}

	releasePointer = (event: any) => {
		var pointerId = this.makePointerId(event);
		if (this.#pointers[pointerId] != undefined) {
			delete this.#pointers[pointerId];
			this.#pointersLength--;
			if (this.#pointersLength != 2) this.#isZoomGesture = false;
		}
	}

	makePointerId = (pointerEvent: any) => {
		return "poinderID" + pointerEvent.pointerId;
	}

	setPointer = (pointerEvent: any) => {
		var pointer = {
			clientX: pointerEvent.clientX,
			clientY: pointerEvent.clientY,
		};
		var pointerId = this.makePointerId(pointerEvent);
		this.#pointers[pointerId] = pointer;
	}



	onPointerDown = (event: any) => {
		//console.log('onPointerDown');
		if (event.pointerType != 'touch') return;
		this.setPointer(event);
		this.#pointersLength++;
		if (this.#pointersLength == 2) {
			this.#isZoomGesture = true;
			if (this.enableZoom === false) return;
			this.#state = this.#STATE.TOUCH_DOLLY;
			this.handleTouchStartDolly(new PointersToTouchAdapter(this.#pointers));
		} else {
			this.#isZoomGesture = false;
		}
	}

	onPointerMove = (event: any) => {
		//console.log('onPointerMove');	
		if (event.pointerType != 'touch' || this.#pointers[this.makePointerId(event)] == undefined) return;
		this.setPointer(event);
		//console.log('length = ' + pointersLength);
		if (this.#isZoomGesture) {
			if (this.enableZoom === false) return;
			this.handleTouchMoveDolly(new PointersToTouchAdapter(this.#pointers));
		}
	}

	onContextMenu = (event: any) => {
		event.preventDefault();
	}

	// backward compatibility

	get center() {
		console.warn('THREE.OrbitControls: .center has been renamed to .target');
		return this.target;
	}

	get noZoom() {
		console.warn('THREE.OrbitControls: .noZoom has been deprecated. Use .enableZoom instead.');
		return !this.enableZoom;
	}
	set noZoom(value) {
		console.warn('THREE.OrbitControls: .noZoom has been deprecated. Use .enableZoom instead.');
		this.enableZoom = !value;
	}

	get noRotate() {
		console.warn('THREE.OrbitControls: .noRotate has been deprecated. Use .enableRotate instead.');
		return !this.enableRotate;
	}
	set noRotate(value) {
		console.warn('THREE.OrbitControls: .noRotate has been deprecated. Use .enableRotate instead.');
		this.enableRotate = !value;
	}

	get noPan() {
		console.warn('THREE.OrbitControls: .noPan has been deprecated. Use .enablePan instead.');
		return !this.enablePan;
	}
	set noPan(value) {
		console.warn('THREE.OrbitControls: .noPan has been deprecated. Use .enablePan instead.');
		this.enablePan = !value;
	}

	get noKeys() {
		console.warn('THREE.OrbitControls: .noKeys has been deprecated. Use .enableKeys instead.');
		return !this.enableKeys;
	}
	set noKeys(value) {
		console.warn('THREE.OrbitControls: .noKeys has been deprecated. Use .enableKeys instead.');
		this.enableKeys = !value;
	}

	get staticMoving() {
		console.warn('THREE.OrbitControls: .staticMoving has been deprecated. Use .enableDamping instead.');
		return !this.enableDamping;
	}
	set staticMoving(value) {
		console.warn('THREE.OrbitControls: .staticMoving has been deprecated. Use .enableDamping instead.');
		this.enableDamping = !value;
	}

	get dynamicDampingFactor() {
		console.warn('THREE.OrbitControls: .dynamicDampingFactor has been renamed. Use .dampingFactor instead.');
		return this.dampingFactor;
	}
	set dynamicDampingFactor(value) {
		console.warn('THREE.OrbitControls: .dynamicDampingFactor has been renamed. Use .dampingFactor instead.');
		this.dampingFactor = value;
	}
}
