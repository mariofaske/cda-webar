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
import { Node } from "./js/render/core/node.js";
import { Gltf2Node } from "./js/render/nodes/gltf2.js";
import { DropShadowNode } from "./js/render/nodes/drop-shadow.js";
import { vec3, quat } from "./js/render/math/gl-matrix.js";
import { QuadNode } from "./js/render/nodes/quad-texture.js";
import { SevenSegmentText } from "./js/render/nodes/seven-segment-text.js";
import { ButtonNode } from "./js/render/nodes/button.js";
import { UrlTexture } from "./js/render/core/texture.js";

var vertexShaderSource = `
attribute vec4 a_position;
attribute vec4 a_color;

uniform mat4 u_matrix;

varying vec4 v_color;

void main() {
  // Multiply the position by the matrix.
  gl_Position = u_matrix * a_position;

  // Pass the color to the fragment shader.
  v_color = a_color;
}`;

var fragmentShaderSource = `
precision mediump float;

// Passed in from the vertex shader.
varying vec4 v_color;

void main() {
   gl_FragColor = v_color;
}`;

// XR globals.
let xrButton = null;
let xrRefSpace = null;
let xrViewerSpace = null;
let xrHitTestSource = null;

const userTests = false;
let userData = {};

// WebGL scene globals.
/* var canvas = document.querySelector("#canvas");
let gl = canvas.getContext("webgl", { xrCompatible: true }); */

let gl = null;
let renderer = null;
let scene = new Scene();
scene.enableStats(false);

let arObject = new Node();
arObject.visible = false;
scene.addNode(arObject);

let flower = new Gltf2Node({ url: "media/sunflower/sunflower.gltf" });
arObject.addNode(flower);

let reticle = new Gltf2Node({ url: "media/reticle/reticle.gltf" });
reticle.visible = false;
reticle.scale = [0.01, 0.01, 0.01];
scene.addNode(reticle);
let reticleHitTestResult = null;

// Having a really simple drop shadow underneath an object helps ground
// it in the world without adding much complexity.
let shadow = new DropShadowNode();
vec3.set(shadow.scale, 0.15, 0.15, 0.15);
arObject.addNode(shadow);

// Ensure the background is transparent for AR.
scene.clear = false;

var nameElement = document.querySelector("#name");
var dateElement = document.querySelector("#date");
var sizeElement = document.querySelector("#size");
var infoElement = document.querySelector("#info");
infoElement.style.display = "none";

var onBoardingElement = document.querySelector("#onBoarding");
var loader = document.querySelector("#loader");
loader.style.display = "none";

var howToElement = document.querySelector("#howTo");

var timelineShown = false;
var partShown = false;

////////////////////////////////
/* howToElement.textContent =
  "How to use this app: \n\n1. Point your camera at the flower \n2. Tap on the screen to place the flower \n3. Tap on the flower to see more information";
 */
//howToElement.textContent = "TEST";
//howToElement.style.display = "block";
////////////////////////////////

function initXR() {
  xrButton = new WebXRButton({
    onRequestSession: onRequestSession,
    onEndSession: onEndSession,
    textEnterXRTitle: "START AR",
    textXRNotFoundTitle: "AR NOT FOUND",
    textExitXRTitle: "EXIT  AR",
  });
  document.querySelector("header").appendChild(xrButton.domElement);

  if (navigator.xr) {
    // Checks to ensure that 'immersive-ar' or 'immersive-vr' mode is available,
    // and only enables the button if so.
    navigator.xr.isSessionSupported("immersive-ar").then((supported) => {
      xrButton.enabled = supported;
    });

    //navigator.xr.requestSession("inline").then(onSessionStarted);
  }
}

function onRequestSession() {
  return navigator.xr
    .requestSession("immersive-ar", {
      requiredFeatures: ["local", "anchors", "hit-test"],
      optionalFeatures: ["dom-overlay"],
      domOverlay: { root: document.getElementById("overlay") },
    })
    .then((session) => {
      xrButton.setSession(session);
      onSessionStarted(session);
    });
}

function onSessionStarted(session) {
  session.addEventListener("end", onSessionEnded);
  session.addEventListener("select", onSelect);

  const d = new Date();
  userData["start"] = {
    date: `${d.getDate()}.${
      d.getMonth() + 1
    }.${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`,
  };

  //howToElement.style.display = "none";

  //getSelection();

  if (!gl) {
    gl = createWebGLContext({
      xrCompatible: true,
    });

    renderer = new Renderer(gl);

    scene.setRenderer(renderer);
  }
  scene.inputRenderer.useProfileControllerMeshes(session);

  /* onBoardingElement.textContent =
    "System calibration in progress... Please move back one step, hold still and wait for the calibration to complete.";
 */
  loader.style.display = "block";
  onBoardingElement.textContent =
    "Bitte NICHT BEWEGEN während der Kalibrierung";
  session.updateRenderState({ baseLayer: new XRWebGLLayer(session, gl) });

  session.requestReferenceSpace("viewer").then((refSpace) => {
    xrViewerSpace = refSpace;
    session
      .requestHitTestSource({ space: xrViewerSpace })
      .then((hitTestSource) => {
        xrHitTestSource = hitTestSource;
      });
  });

  let refSpaceType = "local";
  session.requestReferenceSpace(refSpaceType).then((refSpace) => {
    xrRefSpace = refSpace;
    session.requestAnimationFrame(onXRFrame);
  });
}

function sendData() {
  if (userTests) {
    console.log(JSON.stringify(userData));
    var xhr = new XMLHttpRequest();
    xhr.open("POST", "https://mivs03.gm.fh-koeln.de/cranach-ar-backend/", true);
    xhr.setRequestHeader("Content-Type", "application/json");
    xhr.send(JSON.stringify(userData));
  } else {
    console.log(userData);
  }
}

function onEndSession(session) {
  const d = new Date();
  userData["end"] = {
    date: `${d.getDate()}.${
      d.getMonth() + 1
    }.${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`,
  };
  sendData();
  anchoredObjects = [];
  xrHitTestSource.cancel();
  xrHitTestSource = null;
  infoElement.style.display = "none";
  session.end();
}

function onSessionEnded(event) {
  xrButton.setSession(null);
}

async function fetchImage(url) {
  const response = await fetch(url, {
    mode: "no-cors",
  });
  const blob = await response.blob();
  const imageObjectURL = URL.createObjectURL(blob);
  console.log(imageObjectURL);

  return imageObjectURL;
}

async function downloadFile(url, filename) {
  fetch(url, {
    mode: "no-cors",
  })
    .then((response) => response.blob())
    .then((blob) => {
      const link = document.createElement("a");
      link.href = URL.createObjectURL(blob);
      link.download = filename;
      link.click();
    })
    .catch(console.error);
  /*   let response = await fetch(url);
  if (response.status === 200) {
    const imageBlob = await response.blob();
    const imageUrl = URL.createObjectURL(imageBlob);
    return imageUrl;
  } */
}

const MAX_ANCHORED_OBJECTS = 30;
let anchoredObjects = [];

function addAnchoredObjectToScene(anchor, imagePosition, anchorPose) {
  console.debug("Anchor created");

  //removeStats();
  infoElement.style.display = "none";

  /*   let tempArray = [];
  for (let index = 0; index < scene.children.length; index++) {
    const element = scene.children[index];
    const text = element.name;
    if (text == null) {
      tempArray.push(element);
    }
  }
  scene.children = tempArray; */
  //anchoredObjects = [];

  let image = getImage(imagePosition);

  let textureNode = new QuadNode(image.image_local, 1, true);

  textureNode.name = `image_${image.date}`;

  /*   anchoredObjects.forEach((element) => {
        if (element.imageInfo.date.includes(image.date)) {
          hitObject = element;
        }
      }); */

  //console.log(scene.children);

  var indexOfObjectInScene = scene.children.findIndex((element) => {
    /*     console.log(element.name + " " + image.date);
    console.log(typeof element.name); */
    if (
      element.name != null &&
      !element.name.includes("button") &&
      !element.name.includes("part")
    )
      return element.name.includes("image_" + image.date);
  });

  if (indexOfObjectInScene != -1) {
    scene.children.splice(indexOfObjectInScene, 1);
  }

  var indexOfObject = anchoredObjects.findIndex((element) =>
    element.imageInfo.date.includes(image.date)
  );
  if (indexOfObject != -1) {
    anchoredObjects.splice(indexOfObject, 1);
  }
  scene.addNode(textureNode);

  anchoredObjects.push({
    anchoredObject: textureNode,
    anchor: anchor,
    imageInfo: image,
  });

  //addButton(anchorPose, image);

  const d = new Date();
  const time = `${d.getDate()}.${
    d.getMonth() + 1
  }.${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
  userData[time] = { image };

  partShown = false;
  /*   if (anchoredObjects.length > MAX_ANCHORED_OBJECTS) {
    let objectToRemove = anchoredObjects.shift();
    scene.removeNode(objectToRemove);
    objectToRemove.anchor.delete();
  } */
}

function addPart(anchorPose, image) {
  let imagePart = image.part;
  for (let index = 0; index < scene.children.length; index++) {
    const element = scene.children[index];
    if (element.name != null) {
      const name = element.name;
      if (name.includes("image_1515")) {
        console.log(scene.children[index]);
        scene.children[index].visible = false;
      }
      /*       if (name.includes("button")) {
        scene.children[index].visible = false;
      } */
    }
  }
  //infoElement.style.display = "none";
  let partOfImage = new QuadNode(imagePart.image_local, 1, true);
  partOfImage.name = `part_${image.date}`;
  //quat.fromEuler(partOfImage.rotation, 0.0, 0.0, 0.0);
  //partOfImage.scale = [0.5, 0.5, 0.5];
  partOfImage.translation = [
    anchorPose.position.x,
    anchorPose.position.y,
    anchorPose.position.z,
  ];

  scene.addNode(partOfImage);

  partShown = true;
}

function addButton(anchorPose, image) {
  let imagePart = image.part;
  let buttonTexture = new UrlTexture(imagePart.image_local);
  let partOfButton = new ButtonNode(buttonTexture, () => {
    console.log("Button clicked");
    if (!partShown) {
      addPart(anchorPose, image);
    } else {
      for (let index = 0; index < scene.children.length; index++) {
        const element = scene.children[index];
        if (element.name != null) {
          const name = element.name;
          if (name.includes("part_1515")) {
            console.log("Part?: " + name);
            console.log(scene.children[index]);
            scene.children[index].visible = false;
          }
          if (name.includes("image_1515")) {
            console.log("Image?: " + name);
            console.log(scene.children[index]);
            scene.children[index].visible = true;
          }
        }
      }
      partShown = false;
    }
  });
  /*   partOfButton.onHoverStart = () => {
    console.log("Hover start");
  }; */
  partOfButton.name = `button_${image.date}`;
  quat.fromEuler(partOfButton.rotation, -45.0, 0.0, 0.0);
  partOfButton.scale = [5.0, 5.0, 5.0];
  //imageButton.scale = [10, 10, 10];
  partOfButton.translation = [
    anchorPose.position.x,
    anchorPose.position.y - 1,
    anchorPose.position.z,
  ];

  var indexOfObjectInScene = scene.children.findIndex((element) => {
    /*     console.log(element.name + " " + image.date);
    console.log(typeof element.name); */
    if (
      element.name != null &&
      !element.name.includes("image") &&
      !element.name.includes("part")
    )
      return element.name.includes("button_" + image.date);
  });
  console.log(indexOfObjectInScene);

  if (indexOfObjectInScene != -1) {
    scene.children.splice(indexOfObjectInScene, 1);
  }

  /*   var indexOfObject = anchoredObjects.findIndex((element) =>
    element.imageInfo.date.includes(image.date)
  );
  console.log(indexOfObject);
  if (indexOfObject != -1) {
    anchoredObjects.splice(indexOfObject, 1);
  } */

  scene.addNode(partOfButton);

  const d = new Date();
  const time = `${d.getDate()}.${
    d.getMonth() + 1
  }.${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
  userData[time] = { buttonPressed: `button_${image.date}` };
  /*   for (let index = 0; index < scene.children.length; index++) {
    const element = scene.children[index];
    if (element.name == `button_${image.date}`) {
      scene.children[index].scale = [10, 10, 10];
      scene.children[index].translation = [0, -5, -1];
      console.log(scene.children[index]);
    }
  } */
  /*   anchoredObjects.push({
    anchoredObject: playButton,
    anchor: anchor,
  }); */
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

let selection = [
  {
    date: "1515",
    name: "Die Enthauptung Johannes des Täufers",
    image_src:
      "https://lucascranach.org/imageserver-2022/CZ_ESGK_KE2367_FR073/01_Overall/CZ_ESGK_KE2367_FR073_2008-02_Overall-origin.jpg",
    image_local: "media/images/image_1515.jpg",
    digital_size: { width: 1839, height: 2679 }, // origin // gl.getParameter(gl.MAX_TEXTURE_SIZE) = 4096
    real_size: { width: 58, height: 84 },
    range: { start: 0, end: 58 },
    part: {
      date: "1515",
      name: "Die Enthauptung der Hl. Katharina",
      image_src:
        "https://lucascranach.org/imageserver-2022/CZ_ESGK_KE2371_FR074/01_Overall/CZ_ESGK_KE2371_FR074_2008-02_Overall-origin.jpg",
      image_local: "media/images/image_1515_part.jpg",
      digital_size: { width: 1730, height: 2529 },
      real_size: { width: 58, height: 84 },
      range: { start: 0, end: 58 },
    },
  },
  {
    date: "1520",
    name: "Christi Abschied von seiner Mutter",
    image_src:
      "https://lucascranach.org/imageserver-2022/AT_KHM_GG891_FR132/01_Overall/AT_KHM_GG891_FR132_2009-06-22_Overall-m.jpg",
    image_local: "media/images/image_1520.jpeg",
    digital_size: { width: 600, height: 783 }, // medium // gl.getParameter(gl.MAX_TEXTURE_SIZE) = 4096
    real_size: { width: 83.5, height: 110 },
    range: { start: 108, end: 191 },
  },
  {
    date: "1525",
    name: "Heiliger Hieronymus in der Einöde",
    image_src:
      "https://lucascranach.org/imageserver-2022/AT_TLFI_Gem116_FR169/01_Overall/AT_TLFI_Gem116_FR169_2014-06_Overall-m.jpg",
    image_local: "media/images/image_1525.jpeg",
    digital_size: { width: 600, height: 509 }, // gl.getParameter(gl.MAX_TEXTURE_SIZE) = 4096
    real_size: { width: 67, height: 90 },
    range: { start: 243, end: 310 },
  },
  {
    date: "1530",
    name: "Paradies",
    image_src:
      "https://lucascranach.org/imageserver-2022/AT_KHM_GG3678_FR201/01_Overall/AT_KHM_GG3678_FR201_2009-05-06_Overall-m.jpg",
    image_local: "media/images/image_1530.jpeg",
    digital_size: { width: 600, height: 431 }, // medium // gl.getParameter(gl.MAX_TEXTURE_SIZE) = 4096
    real_size: { width: 114, height: 82 },
    range: { start: 360, end: 474 },
  },
];

/* function getSelection() {
  var credentials = btoa(`${env.NAME}:${env.PASSWORD}`);
  var auth = { Authorization: `Basic ${credentials}` };
  fetch(
    "https://mivs02.gm.fh-koeln.de/?is_best_of=true&dating_begin:gte=1515&&dating_end:gte=1515&show_data_all=true",
    { headers: auth }
  )
    .then((response) => response.json())
    .then((data) => {
      console.log(data);
    });
} */

function getImageData() {
  let dates = [];
  for (let index = 0; index < selection.length; index++) {
    const element = selection[index];
    const data = {
      date: element.date,
      start: element.range.start,
      end: element.range.end,
    };
    dates.push(data);
  }
  return dates;
}

function getImage(x) {
  let value = parseInt(Math.abs(x) * 100);
  if (value > selection[selection.length - 1].range.end) {
    return selection[selection.length - 1];
  }
  for (let index = 0; index < selection.length; index++) {
    const element = selection[index];
    let end = parseInt(element.range.end);
    if (value <= end) {
      return element;
    }
  }
}

function getImagePosition(x) {
  let value = parseInt(Math.abs(x) * 100);
  if (value > selection[selection.length - 1].range.end) {
    if (x < 0) {
      return (
        ((selection[selection.length - 1].range.start +
          selection[selection.length - 1].range.end) /
          2 /
          100) *
        -1
      );
    } else {
      return (
        (selection[selection.length - 1].range.start +
          selection[selection.length - 1].range.end) /
        2 /
        100
      );
    }
  }
  for (let index = 0; index < selection.length; index++) {
    const element = selection[index];
    let start = parseInt(element.range.start);
    let end = parseInt(element.range.end);
    if (value <= end) {
      if (x < 0) {
        return ((start + end) / 2 / 100) * -1;
      } else {
        return (start + end) / 2 / 100;
      }
    }
  }
}

function removeStats() {
  for (let index = 0; index < scene.children.length; index++) {
    //console.log(scene.children[index]);
    const element = scene.children[index];
    const text = element.name;
    if (text != null) {
      if (text.includes("text")) {
        scene.children.splice(index, 1);
        anchoredObjects[0].showStats = false;
        infoElement.style.display = "none";
        return;
      }
    }
  }
}

function addStats(imageInfo, statsPose) {
  /* let someText = new SevenSegmentText();

  someText.name = `text_${imageInfo.date}`;

  someText.translation = [
    statsPose.position.x,
    statsPose.position.y - 0.1,
    statsPose.position.z,
  ];

  someText.scale = [0.05, 0.05, 0.05];
  quat.fromEuler(someText.rotation, -45.0, 0.0, 0.0);

  scene.addNode(someText); */
  /*   await setTimeout(() => {
  }, 1000); */

  //scene.children[scene.children.length - 1].text = `${imageInfo.date}`;

  var indexOfObject = anchoredObjects.findIndex((element) =>
    element.anchoredObject.name.includes(imageInfo.date)
  );
  console.log(indexOfObject);
  anchoredObjects[indexOfObject].showStats = true;
  //console.log(stats.children);
  nameElement.textContent = imageInfo.name;
  dateElement.textContent = imageInfo.date;
  sizeElement.textContent = `${imageInfo.real_size.width} x ${imageInfo.real_size.height} cm`;

  infoElement.style.display = "block";

  const d = new Date();
  const time = `${d.getDate()}.${
    d.getMonth() + 1
  }.${d.getFullYear()} - ${d.getHours()}:${d.getMinutes()}:${d.getSeconds()}`;
  userData[time] = {
    Stats: { imageDate: imageInfo.date, imageName: imageInfo.name },
  };

  /*   setTimeout(() => {
    scene.children[scene.children.length - 1].scale = [0.1, 0.1, 0.1];
  }, 10); */
  /*   anchoredObjects.push({
    anchoredObject: stats,
    anchor: anchor,
  }); */

  /* scene.children[scene.children.length - 1].children[
    scene.children[scene.children.length - 1].children.length - 1
  ].text = `${imageInfo.date}`; */

  /*   let someText = new SevenSegmentText();

  someText.text = "test";

  stats.addNode(someText); */

  /*   console.log(
    scene.children[scene.children.length - 1].children[
      scene.children[scene.children.length - 1].children.length - 1
    ].text
  ); */
}

/* let rayOrigin = vec3create();
let rayDirection = vec3create(); */

function onSelect(event) {
  let frame = event.frame;
  let pose = reticleHitTestResult.getPose(xrRefSpace);
  let targetRayPose = frame.getPose(
    event.inputSource.targetRaySpace,
    xrRefSpace
  );
  let refSpace = xrRefSpace;
  scene.handleSelect(event.inputSource, frame, refSpace);
  const p = pose.transform.position;
  //const o = pose.transform.orientation;
  let imagePosition = Math.abs(getImagePosition(p.x));

  let hitResult = scene.hitTest(targetRayPose.transform);

  let anchorPose = new XRRigidTransform(
    { x: imagePosition, y: 0, z: p.z },
    { x: 0, y: 0, z: 0, w: 1 }
  );
  /*   let statsPose = new XRRigidTransform(
    { x: imagePosition, y: p.y, z: p.z + 0.1 },
    { x: 0, y: 0, z: 0, w: 1 }
  ); */

  if (reticle.visible && hitResult == null) {
    frame.createAnchor(anchorPose, xrRefSpace).then(
      (anchor) => {
        addAnchoredObjectToScene(anchor, p.x, anchorPose);
        let image = getImage(p.x);
        if (image.part) {
          addButton(anchorPose, image);
        }
      },
      (error) => {
        console.error("Error creating anchor", error);
      }
    );
  } else {
    let name = hitResult.node.name;
    //console.log(hitResult.node);
    if (name.includes("button")) {
      return;
    }
    //console.log(anchoredObjects);
    //console.log("hitResultName: " + name);
    if (name.includes("part")) {
      name = name.replace("part_", "image_");
    }
    //console.log("name: " + name);
    var indexOfObject = anchoredObjects.findIndex((element) =>
      element.anchoredObject.name.includes(name)
    );
    //console.log("indexOfObject: " + indexOfObject);
    if (!anchoredObjects[indexOfObject].showStats) {
      let statsPose = new XRRigidTransform(
        { x: imagePosition, y: p.y, z: p.z + 0.1 },
        { x: 0, y: 0, z: 0, w: 1 }
      );
      /*       let hitObject;
      anchoredObjects.forEach((element) => {
        if (element.anchoredObject.name.includes(name)) {
          hitObject = element;
        }
      }); */

      if (partShown) {
        //addStats(hitObject.imageInfo.part, statsPose);
        if (anchoredObjects[indexOfObject].imageInfo.part != null)
          addStats(anchoredObjects[indexOfObject].imageInfo.part, statsPose);
        else addStats(anchoredObjects[indexOfObject].imageInfo, statsPose);
      } else {
        //addStats(hitObject.imageInfo, statsPose);
        addStats(anchoredObjects[indexOfObject].imageInfo, statsPose);
      }
    } else {
      //removeStats();
      //hitObject.showStats = false;
      console.log("indexOfObject: " + indexOfObject);
      console.log("showStats: " + anchoredObjects[indexOfObject].showStats);
      anchoredObjects[indexOfObject].showStats = false;
      infoElement.style.display = "none";
    }
    //console.log(anchoredObjects[0].imageInfo);
  }
  //console.log(anchoredObjects);
  //console.log(scene.children);
}

function onXRFrame(t, frame) {
  let session = frame.session;
  let pose = frame.getViewerPose(xrRefSpace);

  reticle.visible = false;

  if (pose) {
    const p = pose.transform.position;
    document.getElementById("pose").innerText = `Position: x=${p.x.toFixed(
      3
    )}, y=${p.y.toFixed(3)}, z=${p.z.toFixed(3)}`;
  } else {
    document.getElementById("pose").innerText = "Position: (null pose)";
  }

  // If we have a hit test source, get its results for the frame
  // and use the pose to display a reticle in the scene.
  if (xrHitTestSource && pose) {
    let hitTestResults = frame.getHitTestResults(xrHitTestSource);
    if (hitTestResults.length > 0) {
      let pose = hitTestResults[0].getPose(xrRefSpace);
      const p = pose.transform.position;
      const o = pose.transform.orientation;
      document.getElementById("hittest").innerText = `Hit-Test: x=${p.x.toFixed(
        3
      )}, y=${p.y.toFixed(3)}, z=${p.z.toFixed(3)}`;
      document.getElementById(
        "anchor"
      ).innerText = `Orientation: x=${o.x.toFixed(3)}, y=${o.y.toFixed(
        3
      )}, z=${o.z.toFixed(3)}`;

      /*       let targetRayPose = null;
      frame.inputSources.forEach((inputSource) => {
        targetRayPose = frame.getPose(inputSource.targetRaySpace, xrRefSpace);
      });
      console.log(targetRayPose); */

      /*       const hitTest = scene.hitTest(pose.transform);
      if (hitTest != null && anchoredObjects[0].showStats == false) {
        addStats(anchoredObjects[0].imageInfo, pose);
        console.log(hitTest);
      } else if (hitTest != null && anchoredObjects[0].showStats == true) {
        removeStats();
      } */

      reticle.visible = true;
      reticle.matrix = pose.transform.matrix;
      reticleHitTestResult = hitTestResults[0];
      onBoardingElement.style.display = "none";
      loader.style.display = "none";
      if (!timelineShown) {
        var dates = getImageData();
        for (let index = 0; index < dates.length; index++) {
          const element = dates[index];
          let timelineDate = new SevenSegmentText();
          //timelineDate.name = `date_${element.date}`;
          let timelineDatePose = new XRRigidTransform(
            { x: p.x, y: p.y, z: p.z + 0.1 },
            { x: 0, y: 0, z: 0, w: 1 }
          );
          let position = (element.end + element.start) / 2 / 100;
          timelineDate.translation = [position, p.y - 1, p.z];
          timelineDate.scale = [0.1, 0.1, 0.1];
          scene.addNode(timelineDate);
          scene.children[scene.children.length - 1].text = `${element.date}`;
        }

        timelineShown = true;
      }
    }
  }

  for (const { anchoredObject, anchor } of anchoredObjects) {
    if (!frame.trackedAnchors.has(anchor)) {
      continue;
    }
    const anchorPose = frame.getPose(anchor.anchorSpace, xrRefSpace);
    if (anchorPose) {
      anchoredObject.matrix = anchorPose.transform.matrix;
    }
  }

  scene.updateInputSources(frame, xrRefSpace);

  scene.startFrame();

  session.requestAnimationFrame(onXRFrame);

  scene.drawXRFrame(frame, pose);

  scene.endFrame();
}

initXR();
