/* Copyright 2021 The Immersive Web Community Group
Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files (the "Software"), to deal in
the Software without restriction, including without limitation the rights to
use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
the Software, and to permit persons to whom the Software is furnished to do so,
subject to the following conditions:
The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.
THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE. */

import { WebXRButton } from "./js/util/webxr-button.js";
import { Scene } from "./js/render/scenes/scene.js";
import { Renderer, createWebGLContext } from "./js/render/core/renderer.js";
//import { SkyboxNode } from "./js/render/nodes/skybox.js";
import { InlineViewerHelper } from "./js/util/inline-viewer-helper.js";
import { Gltf2Node } from "./js/render/nodes/gltf2.js";
//import { QueryArgs } from "./js/util/query-args.js";

// XR globals.
let xrButton = null;
let xrImmersiveRefSpace = null;
let inlineViewerHelper = null;

let isARAvailable = false;
let isVRAvailable = false;
let xrSessionString = "immersive-vr";

// WebGL scene globals.
let gl = null;
let renderer = null;
let scene = new Scene();

let initPoint = new Gltf2Node({ url: "media/sunflower/sunflower.gltf" });
// The solar system is big (citation needed). Scale it down so that users
// can move around the planets more easily.
//initPoint.scale = [0.1, 0.1, 0.1];
scene.addNode(initPoint);
// Still adding a skybox, but only for the benefit of the inline view.
//let skybox = new SkyboxNode({ url: "media/textures/milky-way-4k.png" });
//scene.addNode(skybox);
//let image = new Image();

const MAX_ANCHORED_OBJECTS = 30;
let anchoredObjects = [];

// Set with all anchors tracked in a previous frame.
let all_previous_anchors = new Set();

const button = document.querySelector('button[data-action="change"]');

function initXR() {
  xrButton = new WebXRButton({
    onRequestSession: onRequestSession,
    onEndSession: onEndSession,
    textEnterXRTitle: isARAvailable ? "START AR" : "START VR",
    textXRNotFoundTitle: isARAvailable ? "AR NOT FOUND" : "VR NOT FOUND",
    textExitXRTitle: isARAvailable ? "EXIT  AR" : "EXIT  VR",
  });
  document.querySelector("header").appendChild(xrButton.domElement);

  if (navigator.xr) {
    // Checks to ensure that 'immersive-ar' or 'immersive-vr' mode is available,
    // and only enables the button if so.
    navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
      isARAvailable = supported;
      xrButton.enabled = supported;
      if (!supported) {
        navigator.xr.isSessionSupported("immersive-vr").then((supported) => {
          isVRAvailable = supported;
          xrButton.enabled = supported;
        });
      } else {
        xrSessionString = "immersive-ar";
      }
    });

    navigator.xr.requestSession("inline").then(onSessionStarted);
  }
}

function onRequestSession() {
  // Requests an 'immersive-ar' or 'immersive-vr' session, depending on which is supported,
  // and requests the 'anchors' module as a required feature.
  return navigator.xr
    .requestSession(xrSessionString, {
      requiredFeatures: ["anchors"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.getElementById("overlay") },
    })
    .then((session) => {
      xrButton.setSession(session);
      session.isImmersive = true;
      onSessionStarted(session);
    });
}

function initGL() {
  if (gl) return;

  gl = createWebGLContext({
    xrCompatible: true,
  });
  document.body.appendChild(gl.canvas);

  function onResize() {
    gl.canvas.width = gl.canvas.clientWidth * window.devicePixelRatio;
    gl.canvas.height = gl.canvas.clientHeight * window.devicePixelRatio;
  }
  window.addEventListener("resize", onResize);
  onResize();

  renderer = new Renderer(gl);

  console.log(scene);
  scene.setRenderer(renderer);
}

function onRequestSessionError(ex) {
  alert("Failed to start immersive AR session.");
  console.error(ex.message);
}

function onSessionStarted(session) {
  /*   if (session) {
    // Ask for an optional DOM Overlay, see https://immersive-web.github.io/dom-overlays/
    navigator.xr
      .requestSession("immersive-ar", {
        optionalFeatures: ["dom-overlay"],
        domOverlay: { root: document.getElementById("overlay") },
      })
      .then(onSessionStarted, onRequestSessionError);
  } else {
    session.end();
  } */
  session.addEventListener("end", onSessionEnded);
  session.addEventListener("select", onSelect);

  /*   if (session.isImmersive && isARAvailable) {
    // When in 'immersive-ar' mode don't draw an opaque background because
    // we want the real world to show through.
        skybox.visible = false;
  } */

  initGL();

  // This and all future samples that visualize controllers will use this
  // convenience method to listen for changes to the active XRInputSources
  // and load the right meshes based on the profiles array.
  scene.inputRenderer.useProfileControllerMeshes(session);

  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

  //let refSpaceType = session.isImmersive ? "local" : "viewer";
  //let refSpaceType = "unbounded";
  let refSpaceType = "local";
  session.requestReferenceSpace(refSpaceType).then((refSpace) => {
    if (session.isImmersive) {
      console.log(refSpace);
      refSpace.addEventListener("reset", onReset);
      xrImmersiveRefSpace = refSpace;
    } else {
      inlineViewerHelper = new InlineViewerHelper(gl.canvas, refSpace);
    }
    session.requestAnimationFrame(onXRFrame);
  });
}

function onEndSession(session) {
  session.end();
}

function onSessionEnded(event) {
  if (event.session.isImmersive) {
    xrButton.setSession(null);
    // Turn the background back on when we go back to the inlive view.
    //skybox.visible = true;
  }
}

function onReset(event) {
  let transform = event.transform;
  document.getElementById("reset").innerText = transform.position;
}

function addAnchoredObjectToScene(anchor) {
  console.debug("Anchor created");

  /*  const eventFrame = event.frame
  const anchorPose = frame.getPose(anchor.anchorSpace, xrRefSpace);
  const p = anchorPose.transform.position;

  document.getElementById("anchor").innerText = `Position: x=${p.x.toFixed(
    3
  )}, y=${p.y.toFixed(3)}, z=${p.z.toFixed(3)}`;
  console.log(anchorPose); */
  //displayMatrix(anchor.transform.matrix, 4, document.getElementById("matrix"));

  anchor.context = {};

  let flower = new Gltf2Node({ url: "media/sunflower/sunflower.gltf" });
  scene.addNode(flower);
  anchor.context.sceneObject = flower;
  flower.anchor = anchor;
  anchoredObjects.push(flower);

  displayMatrix(
    scene.children[scene.children.length - 1].matrix,
    4,
    document.getElementById("matrix")
  );

  setTimeout(() => {
    console.log(scene.children[scene.children.length - 1].matrix);
    console.log(anchoredObjects[0].matrix[0]);
    displayMatrix(
      scene.children[scene.children.length - 1].matrix,
      4,
      document.getElementById("matrix")
    );
  }, 10);
  //console.log(anchoredObjects[0].matrix[0]);

  /*   console.log(flower.anchor.context.sceneObject.matrix);
  console.log(flower.anchor.context.sceneObject.worldMatrix); */

  /*   anchoredObjects.forEach((element) => {
    console.log(element.matrix);
  }); */

  // For performance reasons if we add too many objects start
  // removing the oldest ones to keep the scene complexity
  // from growing too much.
  if (anchoredObjects.length > MAX_ANCHORED_OBJECTS) {
    let objectToRemove = anchoredObjects.shift();
    scene.removeNode(objectToRemove);
    objectToRemove.anchor.delete();
  }
}

function displayMatrix(mat, rowLength, target) {
  let outHTML = "";

  if (mat && rowLength && rowLength <= mat.length) {
    let numRows = mat.length / rowLength;
    outHTML =
      "<math xmlns='http://www.w3.org/1998/Math/MathML' display='block'>\n<mrow>\n<mo>[</mo>\n<mtable>\n";

    for (let y = 0; y < numRows; y++) {
      outHTML += "<mtr>\n";
      for (let x = 0; x < rowLength; x++) {
        outHTML += `<mtd><mn>${mat[x * rowLength + y].toFixed(8)}</mn></mtd>\n`;
      }
      outHTML += "</mtr>\n";
    }

    outHTML += "</mtable>\n<mo>]</mo>\n</mrow>\n</math>";
  }

  target.innerHTML = outHTML;
}

function onSelect(event) {
  document.getElementById("log").innerText = event.frame;
  let frame = event.frame;
  let session = frame.session;
  let anchorPose = new XRRigidTransform();
  let inputSource = event.inputSource;

  //console.log(anchorPose);

  // If the user is on a screen based device, place the anchor 1 meter in front of them.
  // Otherwise place the anchor at the location of the input device
  if (inputSource.targetRayMode == "screen") {
    anchorPose = new XRRigidTransform(
      { x: 0, y: 0, z: -1 },
      { x: 0, y: 0, z: 0, w: 1 }
    );
  }

  if (session.isImmersive) {
    // Create a free-floating anchor.
    frame.createAnchor(anchorPose, inputSource.targetRaySpace).then(
      (anchor) => {
        addAnchoredObjectToScene(anchor);
      },
      (error) => {
        button.innerText = "Error creating anchor: " + error;
        console.error("Could not create anchor: " + error);
      }
    );
  }
}

function onXRFrame(t, frame) {
  let session = frame.session;
  let xrRefSpace = session.isImmersive
    ? xrImmersiveRefSpace
    : inlineViewerHelper.referenceSpace;
  let pose = frame.getViewerPose(xrRefSpace);

  if (pose) {
    const p = pose.transform.position;
    document.getElementById("pose").innerText = `Position: x=${p.x.toFixed(
      3
    )}, y=${p.y.toFixed(3)}, z=${p.z.toFixed(3)}`;
  } else {
    document.getElementById("pose").innerText = "Position: (null pose)";
  }

  //button.innerText = `${pose.transform.position}`;

  // Update the position of all the anchored objects based on the currently reported positions of their anchors
  const tracked_anchors = frame.trackedAnchors;
  if (tracked_anchors) {
    all_previous_anchors.forEach((anchor) => {
      if (!tracked_anchors.has(anchor)) {
        scene.removeNode(anchor.sceneObject);
      }
    });

    tracked_anchors.forEach((anchor) => {
      const anchorPose = frame.getPose(anchor.anchorSpace, xrRefSpace);
      if (anchorPose) {
        anchor.context.sceneObject.matrix = anchorPose.transform.matrix;
        anchor.context.sceneObject.visible = true;
      } else {
        anchor.context.sceneObject.visible = false;
      }
    });

    all_previous_anchors = tracked_anchors;
  } else {
    all_previous_anchors.forEach((anchor) => {
      scene.removeNode(anchor.sceneObject);
    });

    all_previous_anchors = new Set();
  }

  // In this sample and most samples after it we'll use a helper function
  // to automatically add the right meshes for the session's input sources
  // each frame. This also does simple hit detection to position the
  // cursors correctly on the surface of selectable nodes.
  scene.updateInputSources(frame, xrRefSpace);

  scene.startFrame();

  session.requestAnimationFrame(onXRFrame);

  scene.drawXRFrame(frame, pose);

  scene.endFrame();
}

initXR();
