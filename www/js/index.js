// (c) 2014 Don Coleman
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//     http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.

/* global mainPage, deviceList, refreshButton */
/* global detailPage, resultDiv, messageInput, sendButton, disconnectButton */
/* global ble  */
/* jshint browser: true , devel: true*/
'use strict';

// ASCII only
function bytesToString(buffer) {
    return String.fromCharCode.apply(null, new Uint8Array(buffer));
}

// ASCII only
function stringToBytes(string) {
    var array = new Uint8Array(string.length);
    for (var i = 0, l = string.length; i < l; i++) {
        array[i] = string.charCodeAt(i);
    }
    return array.buffer;
}

function create(text, name, type) {
    var dataButton = document.getElementById("saveDataButton");
    dataButton.href = 'data:attachment/text,' + encodeURI(text);
    dataButton.target = '_blank';
    dataButton.download = 'myFile.txt';
}

// this is Nordic's UART service
var bluefruit = {
    serviceUUID: '6e400001-b5a3-f393-e0a9-e50e24dcca9e',
    txCharacteristic: '6e400002-b5a3-f393-e0a9-e50e24dcca9e', // transmit is from the phone's perspective
    rxCharacteristic: '6e400003-b5a3-f393-e0a9-e50e24dcca9e' // receive is from the phone's perspective
};

var dataBuffer = new Uint8Array(29000);
var lastIndex = 0;

var app = {


    initialize: function() {
        this.bindEvents();
        detailPage.hidden = true;
    },
    bindEvents: function() {
        document.addEventListener('deviceready', this.onDeviceReady, false);
        refreshButton.addEventListener('touchstart', this.refreshDeviceList, false);
        sendButton.addEventListener('click', this.sendData, false);
        disconnectButton.addEventListener('touchstart', this.disconnect, false);
        prepareDataButton.addEventListener('click', this.prepareData, false);
        deviceList.addEventListener('touchstart', this.connect, false); // assume not scrolling
        requestFsButton.addEventListener('click', this.requestAndroidFS, false);
    },
    onDeviceReady: function() {
        app.refreshDeviceList();
    },
    debugLog: function(string) {
        resultDiv.innerHTML = resultDiv.innerHTML + string + " <br/>";
    },
    requestAndroidFS: function() {
        this.debugLog("Requesting File System");
        window.requestFileSystem(LocalFileSystem.PERSISTENT, 0, function(fs) {
            this.debugLog("Requesting File System : OK");
            this.debugLog("File is : " + fs.name);

            //console.log('file system open: ' + fs.name);
            fs.root.getFile("newPersistentFile.txt", { create: true, exclusive: false }, function(fileEntry) {

                //console.log("fileEntry is file?" + fileEntry.isFile.toString());
                this.debugLog("fileEntry is file?" + fileEntry.isFile.toString())
                    // fileEntry.name == 'someFile.txt'
                    // fileEntry.fullPath == '/someFile.txt'
                this.writeFile(fileEntry, null);

            }, this.debugLog("Error getFile"));

        }, this.debugLog("Error Get FS"));
    },
    writeFile: function(fileEntry, dataObj) {
        // Create a FileWriter object for our FileEntry (log.txt).
        fileEntry.createWriter(function(fileWriter) {

            fileWriter.onwriteend = function() {
                //console.log("Successful file write...");
                resultDiv.innerHTML = resultDiv.innerHTML + "Successful file write...<br/>";
                readFile(fileEntry);
            };

            fileWriter.onerror = function(e) {
                //console.log("Failed file write: " + e.toString());
                resultDiv.innerHTML = resultDiv.innerHTML + "Failed file write: " + e.toString() + "<br/>";
            };

            // If data object is not passed in,
            // create a new Blob instead.
            if (!dataObj) {
                dataObj = new Blob(['some file data'], { type: 'text/plain' });
            }

            fileWriter.write(dataObj);
        });
    },
    refreshDeviceList: function() {
        deviceList.innerHTML = ''; // empties the list
        ble.scan([bluefruit.serviceUUID], 5, app.onDiscoverDevice, app.onError);

        // if Android can't find your device try scanning for all devices
        // ble.scan([], 5, app.onDiscoverDevice, app.onError);
    },
    onDiscoverDevice: function(device) {
        var listItem = document.createElement('li'),
            html = '<b>' + device.name + '</b><br/>' +
            'RSSI: ' + device.rssi + '&nbsp;|&nbsp;' +
            device.id;

        listItem.dataset.deviceId = device.id;
        listItem.innerHTML = html;
        deviceList.appendChild(listItem);
    },
    connect: function(e) {
        var deviceId = e.target.dataset.deviceId,
            onConnect = function(peripheral) {
                app.determineWriteType(peripheral);

                // subscribe for incoming data
                ble.startNotification(deviceId, bluefruit.serviceUUID, bluefruit.rxCharacteristic, app.onData, app.onError);
                sendButton.dataset.deviceId = deviceId;
                disconnectButton.dataset.deviceId = deviceId;
                resultDiv.innerHTML = "";
                app.showDetailPage();
            };

        ble.connect(deviceId, onConnect, app.onError);
    },
    determineWriteType: function(peripheral) {
        // Adafruit nRF8001 breakout uses WriteWithoutResponse for the TX characteristic
        // Newer Bluefruit devices use Write Request for the TX characteristic

        var characteristic = peripheral.characteristics.filter(function(element) {
            if (element.characteristic.toLowerCase() === bluefruit.txCharacteristic) {
                return element;
            }
        })[0];

        if (characteristic.properties.indexOf('WriteWithoutResponse') > -1) {
            app.writeWithoutResponse = true;
        } else {
            app.writeWithoutResponse = false;
        }

    },
    onData: function(data) { // data received from Arduino
        var temp = new Uint8Array(data);
        dataBuffer.set(temp, lastIndex);
        lastIndex = temp.length + lastIndex;

    },
    prepareData: function(event) { // save data to text file
        resultDiv.innerHTML = resultDiv.innerHTML + "Debut Prepare <br/>";
        resultDiv.scrollTop = resultDiv.scrollHeight;

        var stringArray = Array.prototype.slice.call(dataBuffer).map(String);
        var myData = "";
        stringArray.forEach(function(dd) {
            myData = myData + String.fromCharCode(dd);
            if (String.fromCharCode(dd) == "$") {
                myData = myData + "<br/>";
            }
        });
        resultDiv.innerHTML = resultDiv.innerHTML + "The data: <br/>";
        resultDiv.innerHTML = resultDiv.innerHTML + myData;

        create(myData, 'dataPIR.txt', 'text/plain');
        dataBuffer = new Uint8Array(29000);
        lastIndex = 0;
        resultDiv.innerHTML = resultDiv.innerHTML + "Fin <br/>";
        resultDiv.scrollTop = resultDiv.scrollHeight;

    },
    sendData: function(event) { // send data to Arduino

        var success = function() {
            console.log("success");
            resultDiv.innerHTML = resultDiv.innerHTML + "Sent: " + messageInput.value + "<br/>";
            resultDiv.scrollTop = resultDiv.scrollHeight;
        };

        var failure = function() {
            alert("Failed writing data to the bluefruit le");
        };

        var data = stringToBytes(messageInput.value);
        var deviceId = event.target.dataset.deviceId;

        if (app.writeWithoutResponse) {
            ble.writeWithoutResponse(
                deviceId,
                bluefruit.serviceUUID,
                bluefruit.txCharacteristic,
                data, success, failure
            );
        } else {
            ble.write(
                deviceId,
                bluefruit.serviceUUID,
                bluefruit.txCharacteristic,
                data, success, failure
            );
        }

    },
    disconnect: function(event) {
        var deviceId = event.target.dataset.deviceId;
        ble.disconnect(deviceId, app.showMainPage, app.onError);
    },
    showMainPage: function() {
        mainPage.hidden = false;
        detailPage.hidden = true;
    },
    showDetailPage: function() {
        mainPage.hidden = true;
        detailPage.hidden = false;
    },
    onError: function(reason) {
        alert("ERROR: " + JSON.stringify(reason)); // real apps should use notification.alert
    }
};