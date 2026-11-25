
const temp1Element = document.getElementById("temp1");
const temp2Element = document.getElementById("temp2");
const doorElement = document.getElementById("doorStatus");
const fanElement = document.getElementById("fanStatus");

const connectionDot = document.getElementById("connectionDot");
const connectionText = document.getElementById("connectionText");

const temperatureAlertElement =
    document.getElementById("temperatureAlert");

const doorAlarmElement = document.getElementById("doorAlarm");
const arduinoStatusElement = document.getElementById("arduinoStatus");

const openButton = document.getElementById("openButton");
const closeButton = document.getElementById("closeButton");
const servoMessage = document.getElementById("servoMessage");

const chart = document.getElementById("temperatureChart");
const chartContext = chart.getContext("2d");
const chartMessage = document.getElementById("chartMessage");

const history = {
    temp1: [],
    temp2: [],
    labels: []
};

const MAX_POINTS = 30;

document.getElementById("currentDate").textContent =
    new Date().toLocaleDateString("en-IN", {
        weekday: "short",
        day: "numeric",
        month: "short",
        year: "numeric"
    });


function displayTemperature(element, value) {
    if (value === null || value === undefined) {
        element.textContent = "-- °C";
    } else {
        element.textContent = Number(value).toFixed(2) + " °C";
    }
}


function setStatus(element, text, isGood) {
    element.textContent = text;
    element.className = isGood ? "status good" : "status bad";
}


function updateConnection(connected) {
    connectionDot.className = connected
        ? "dot online"
        : "dot offline";

    connectionText.textContent = connected
        ? "Arduino Connected"
        : "Arduino Disconnected";

    arduinoStatusElement.textContent = connected
        ? "Connected"
        : "Disconnected";

    arduinoStatusElement.className = connected
        ? "status good"
        : "status bad";

    openButton.disabled = !connected;
    closeButton.disabled = !connected;
}


function addHistory(temp1, temp2) {
    if (temp1 === null || temp2 === null) {
        return;
    }

    history.temp1.push(temp1);
    history.temp2.push(temp2);
    history.labels.push(new Date().toLocaleTimeString("en-IN"));

    if (history.temp1.length > MAX_POINTS) {
        history.temp1.shift();
        history.temp2.shift();
        history.labels.shift();
    }

    drawChart();
}


function drawChart() {
    const canvasWidth = chart.clientWidth;
    const canvasHeight = chart.clientHeight;

    const pixelRatio = window.devicePixelRatio || 1;

    chart.width = canvasWidth * pixelRatio;
    chart.height = canvasHeight * pixelRatio;

    chartContext.setTransform(
        pixelRatio, 0, 0, pixelRatio, 0, 0
    );

    chartContext.clearRect(0, 0, canvasWidth, canvasHeight);

    if (history.temp1.length === 0) {
        chartMessage.textContent =
            "Waiting for real Arduino sensor readings...";
        return;
    }

    chartMessage.textContent =
        "Showing the latest " + history.temp1.length +
        " received sensor readings.";

    const values = [...history.temp1, ...history.temp2];

    let minValue = Math.min(...values);
    let maxValue = Math.max(...values);

    if (minValue === maxValue) {
        minValue -= 1;
        maxValue += 1;
    }

    const padding = {
        top: 15,
        right: 15,
        bottom: 30,
        left: 45
    };

    const width = canvasWidth - padding.left - padding.right;
    const height = canvasHeight - padding.top - padding.bottom;

    function getX(index) {
        if (history.temp1.length === 1) {
            return padding.left + width / 2;
        }

        return padding.left +
            (index / (history.temp1.length - 1)) * width;
    }

    function getY(value) {
        return padding.top +
            ((maxValue - value) / (maxValue - minValue)) * height;
    }

    // Horizontal grid lines and temperature labels
    chartContext.font = "11px Arial";
    chartContext.fillStyle = "#718096";
    chartContext.strokeStyle = "#e6ebf1";
    chartContext.lineWidth = 1;

    for (let i = 0; i <= 4; i++) {
        const y = padding.top + (height / 4) * i;
        const value = maxValue - ((maxValue - minValue) / 4) * i;

        chartContext.beginPath();
        chartContext.moveTo(padding.left, y);
        chartContext.lineTo(canvasWidth - padding.right, y);
        chartContext.stroke();

        chartContext.fillText(
            value.toFixed(1) + "°",
            3,
            y + 4
        );
    }

    function drawLine(data, lineColor) {
        if (data.length === 0) return;

        chartContext.beginPath();
        chartContext.strokeStyle = lineColor;
        chartContext.lineWidth = 2.5;
        chartContext.lineJoin = "round";
        chartContext.lineCap = "round";

        data.forEach((value, index) => {
            const x = getX(index);
            const y = getY(value);

            if (index === 0) {
                chartContext.moveTo(x, y);
            } else {
                chartContext.lineTo(x, y);
            }
        });

        chartContext.stroke();

        data.forEach((value, index) => {
            chartContext.beginPath();
            chartContext.fillStyle = lineColor;
            chartContext.arc(getX(index), getY(value), 3, 0, Math.PI * 2);
            chartContext.fill();
        });
    }

    drawLine(history.temp1, "#176b87");
    drawLine(history.temp2, "#e39a42");

    // Chart legend
    chartContext.font = "11px Arial";
    chartContext.fillStyle = "#176b87";
    chartContext.fillText("● Sensor 1", padding.left, canvasHeight - 5);

    chartContext.fillStyle = "#e39a42";
    chartContext.fillText("● Sensor 2", padding.left + 95, canvasHeight - 5);
}


async function fetchStatus() {
    try {
        const response = await fetch("/api/status");

        if (!response.ok) {
            throw new Error("Could not fetch system status");
        }

        const data = await response.json();

        updateConnection(data.connected);

        if (!data.connected) {
            displayTemperature(temp1Element, null);
            displayTemperature(temp2Element, null);

            doorElement.textContent = "--";
            fanElement.textContent = "--";

            setStatus(temperatureAlertElement, "--", false);
            setStatus(doorAlarmElement, "--", false);

            return;
        }

        displayTemperature(temp1Element, data.temp1);
        displayTemperature(temp2Element, data.temp2);

        doorElement.textContent = data.door_open ? "OPEN" : "CLOSED";
        fanElement.textContent = data.fan_on ? "ON" : "OFF";

        setStatus(
            temperatureAlertElement,
            data.temperature_alert ? "ALERT" : "NORMAL",
            !data.temperature_alert
        );

        setStatus(
            doorAlarmElement,
            data.door_alarm ? "ACTIVE" : "INACTIVE",
            !data.door_alarm
        );

        addHistory(data.temp1, data.temp2);

    } catch (error) {
        console.error("Dashboard update error:", error);
        updateConnection(false);
    }
}


async function controlServo(command) {
    servoMessage.textContent = "Sending command...";

    try {
        const response = await fetch("/api/servo", {
            method: "POST",
            headers: {
                "Content-Type": "application/json"
            },
            body: JSON.stringify({ command: command })
        });

        const result = await response.json();

        servoMessage.textContent = result.message;

    } catch (error) {
        servoMessage.textContent = "Could not communicate with Flask.";
        console.error(error);
    }
}


window.addEventListener("resize", drawChart);

// Start polling the Flask backend.
// No sample or simulated sensor values are generated.
fetchStatus();
setInterval(fetchStatus, 1000);
