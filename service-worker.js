// Service worker that makes the website run offline.
// Author: Jonas Beuchert
// Sources:
// https://web.dev/offline-cookbook/
// https://developers.google.com/web/fundamentals/codelabs/offline

// Cache name
const CACHE = 'snappergps-lite-static-v1';

async function updateCache() {
    // Open 'caches' object
    caches.open(CACHE).then(function (cache) {
        // Populate 'caches' object with list of resources to cache
        return cache.addAll([
            '/snappergps-app-lite/',
            '/snappergps-app-lite/index.html',
            '/snappergps-app-lite/configure.html',
            '/snappergps-app-lite/upload.html',
            '/snappergps-app-lite/flash.html',
            '/snappergps-app-lite/accelerometer.html',
            '/snappergps-app-lite/pressure-sensor.html',
            '/snappergps-app-lite/images/favicon.ico',
            '/snappergps-app-lite/css/style.css',
            // '/snappergps-app-lite/css/upload.css',
            '/snappergps-app-lite/js/configure/configureComms.js',
            '/snappergps-app-lite/js/configure/configureUI.js',
            // '/snappergps-app-lite/js/upload/uploadComms.js',
            '/snappergps-app-lite/js/upload/uploadUI.js',
            '/snappergps-app-lite/js/configure/flashUI.js',
            '/snappergps-app-lite/js/accelerometer/accelerometerUI.js',
            '/snappergps-app-lite/js/pressure-sensor/pressureSensorUI.js',
            '/snappergps-app-lite/js/deviceCommunication.js',
            '/snappergps-app-lite/js/deviceInfo.js',
            '/snappergps-app-lite/service-worker.js',
            '/snappergps-app-lite/strftime-min.js',
            // '/snappergps-app-lite/FileSaver.js',
            // '/snappergps-app-lite/jszip.min.js',
            '/snappergps-app-lite/firmware/SnapperGPS-Basic.bin',
            '/snappergps-app-lite/firmware/SnapperGPS-Capacitance-Triggered.bin',
            '/snappergps-app-lite/firmware/SnapperGPS-Accelerometer.bin',
            '/snappergps-app-lite/firmware/SnapperGPS-Pressure-Sensor.bin',
        ]);
        // TODO: Handle fail of addAll operation
    })
    console.log('Updated all resources in cache.');
}

// Cache page assets
// Mode: on install - as a dependency
self.addEventListener('install', function (event) {
    event.waitUntil(
        updateCache,
    );
});

// Service worker intercepts requests to resources
// Mode: network, falling back to cache
// Trigger whenever request is made
self.addEventListener('fetch', event => {
    event.respondWith(
        // Try to fetch resource from network
        fetch(event.request).catch(() =>
            // If resource could not be fetched from network, get it from cache
            caches.match(event.request)
        ).then(response =>
            // // If resource could be fetched from network, open cache
            // caches.open(CACHE).then(cache =>
            //     // Put resource from network into cache
            //     cache.put(event.request, response.clone()).then(() =>
                    // Return resource from network
                    response
                // )
            // )
        ),
    );
});

// // Service worker intercepts requests to cached resources
// // Mode: cache, falling back to network
// // Trigger whenever request is made
// self.addEventListener('fetch', function (event) {
//     event.respondWith(
//         // Check if requested resource is available in cache
//         caches.match(event.request).then(function (response) {
//             // If yes, pull from cache, if not, fetch it from network
//             return response || fetch(event.request);
//         }),
//     );

//     // Update entry with latest contents from server.
//     // waitUntil() to prevent worker to be killed until cache is updated.
//     event.waitUntil(
//         update(event.request)
//     );
// });

// Open cache, perform network request, and store new response data.
// function update(request) {
//     return caches.open(CACHE).then(function (cache) {
//         // If there was no need to fetch resource from network:
//         if (!request.bodyUsed) {
//             return fetch(request).then(function (response) {
//                 // if (!response.ok) {
//                 //     throw new TypeError('Bad response status');
//                 //   }
//                 return cache.put(request, response.clone()).then(function () {
//                     return response;
//                 });
//             });
//         }
//     });
// }
