/*
Source https://gist.github.com/nicolocarpignoli/63d90e58a6ee216f99f140779fdb0d24#file-script-js
*/

var lat = 0;
var long = 0;

options = {
  enableHighAccuracy: true,
  timeout: 5000,
  maximumAge: 10000,
};

window.onload = () => {
  const button = document.querySelector('button[data-action="change"]');
  navigator.geolocation.getCurrentPosition(
    (pos) => {
      lat = pos.coords.latitude;
      long = pos.coords.longitude;
      button.innerText =
        pos.coords.latitude +
        " " +
        pos.coords.longitude +
        " " +
        pos.coords.accuracy +
        "m";
      let places = staticLoadPlaces(lat, long);
      renderPlaces(places);
    },
    () => {
      button.innerText = "Error";
    },
    options
  );
  //button.innerText = "﹖";

  //   let places = staticLoadPlaces(lat, long);
  //   renderPlaces(places);
};

let id = navigator.geolocation.watchPosition(getPosition, null, options);

function getPosition(pos) {
  const button = document.querySelector('button[data-action="change"]');
  var distance = calculateDistance(
    lat,
    long,
    pos.coords.latitude,
    pos.coords.longitude
  );
  lat = pos.coords.latitude;
  long = pos.coords.longitude;
  let info = `${pos.coords.latitude} : ${pos.coords.longitude} : ${
    distance * 1000
  }m : ${pos.coords.accuracy}m`;
  button.innerText = info;
}

/*
Source: https://stackoverflow.com/questions/18883601/function-to-calculate-distance-between-two-coordinates
*/

function calculateDistance(lat1, lon1, lat2, lon2) {
  // The math module contains a function
  // named toRadians which converts from
  // degrees to radians.
  lon1 = (lon1 * Math.PI) / 180;
  lon2 = (lon2 * Math.PI) / 180;
  lat1 = (lat1 * Math.PI) / 180;
  lat2 = (lat2 * Math.PI) / 180;

  // Haversine formula
  let dlon = lon2 - lon1;
  let dlat = lat2 - lat1;
  let a =
    Math.pow(Math.sin(dlat / 2), 2) +
    Math.cos(lat1) * Math.cos(lat2) * Math.pow(Math.sin(dlon / 2), 2);

  let c = 2 * Math.asin(Math.sqrt(a));

  // Radius of earth in kilometers. Use 3956
  // for miles
  let r = 6371;

  // calculate the result
  return c * r;
}

function staticLoadPlaces(lat, long) {
  return [
    {
      name: "Pokèmon",
      location: {
        lat: 51.022704,
        lng: 7.561633,
      },
    },
  ];
}

var models = [
  {
    url: "./assets/magnemite/scene.gltf",
    scale: "0.5 0.5 0.5",
    info: "Magnemite, Lv. 5, HP 10/10",
    rotation: "0 180 0",
  },
  {
    url: "./assets/articuno/scene.gltf",
    scale: "0.2 0.2 0.2",
    rotation: "0 180 0",
    info: "Articuno, Lv. 80, HP 100/100",
  },
  {
    url: "./assets/dragonite/scene.gltf",
    scale: "0.08 0.08 0.08",
    rotation: "0 180 0",
    info: "Dragonite, Lv. 99, HP 150/150",
  },
];

var modelIndex = 0;
var setModel = function (model, entity) {
  if (model.scale) {
    entity.setAttribute("scale", model.scale);
  }

  if (model.rotation) {
    entity.setAttribute("rotation", model.rotation);
  }

  if (model.position) {
    entity.setAttribute("position", model.position);
  }

  entity.setAttribute("gltf-model", model.url);

  const div = document.querySelector(".instructions");
  div.innerText = model.info;
};

function renderPlaces(places) {
  let scene = document.querySelector("a-scene");

  places.forEach((place) => {
    let latitude = place.location.lat;
    let longitude = place.location.lng;

    let model = document.createElement("a-entity");
    model.setAttribute(
      "gps-entity-place",
      `latitude: ${latitude}; longitude: ${longitude};`
    );

    setModel(models[modelIndex], model);

    model.setAttribute("animation-mixer", "");

    document
      .querySelector('button[data-action="change"]')
      .addEventListener("click", function () {
        var entity = document.querySelector("[gps-entity-place]");
        modelIndex++;
        var newIndex = modelIndex % models.length;
        setModel(models[newIndex], entity);
      });

    scene.appendChild(model);
  });
}
