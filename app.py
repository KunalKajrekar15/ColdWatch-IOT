
from flask import Flask, render_template, jsonify, request
import serial
import threading
import time

app = Flask(__name__)

SERIAL_PORT = "COM3"
BAUD_RATE = 9600

arduino = None
serial_lock = threading.Lock()
data_lock = threading.Lock()

latest_data = {
    "connected": False,
    "temp1": None,
    "temp2": None,
    "door_open": None,
    "temperature_alert": None,
    "door_alarm": None,
    "fan_on": None,
    "last_update": None
}


def serial_reader():
    global arduino

    while True:
        try:
            if arduino is None or not arduino.is_open:
                print(f"Connecting to Arduino on {SERIAL_PORT}...")

                arduino = serial.Serial(
                    SERIAL_PORT,
                    BAUD_RATE,
                    timeout=2
                )

                time.sleep(2)
                print("SUCCESS: Arduino connected.")

            line = arduino.readline().decode(
                "utf-8",
                errors="ignore"
            ).strip()

            if not line:
                continue

            parts = line.split(",")

            # Expected format:
            # DATA,temp1,temp2,doorOpen,tempAlert,doorAlarm,fanOn
            if len(parts) != 7 or parts[0] != "DATA":
                print("Invalid Arduino data:", line)
                continue

            temp1 = None if parts[1] == "ERR" else float(parts[1])
            temp2 = None if parts[2] == "ERR" else float(parts[2])

            door_open = parts[3] == "1"
            temperature_alert = parts[4] == "1"
            door_alarm = parts[5] == "1"
            fan_on = parts[6] == "1"

            with data_lock:
                latest_data.update({
                    "connected": True,
                    "temp1": temp1,
                    "temp2": temp2,
                    "door_open": door_open,
                    "temperature_alert": temperature_alert,
                    "door_alarm": door_alarm,
                    "fan_on": fan_on,
                    "last_update": time.time()
                })

            print(
                f"DATA: Temp1={temp1}, "
                f"Temp2={temp2}, "
                f"Door Open={door_open}, "
                f"Temperature Alarm={temperature_alert}, "
                f"Door Alarm={door_alarm}, "
                f"Fan={fan_on}"
            )

        except (serial.SerialException, OSError) as error:
            print("ARDUINO CONNECTION ERROR:", error)

            with data_lock:
                latest_data["connected"] = False

            if arduino is not None:
                try:
                    arduino.close()
                except Exception:
                    pass

            arduino = None
            time.sleep(3)

        except (ValueError, IndexError) as error:
            print("INVALID SENSOR DATA:", error)


@app.route("/")
def home():
    return render_template("index.html")


@app.route("/api/status")
def status():
    with data_lock:
        result = latest_data.copy()

    last_update = result["last_update"]

    if last_update is None or time.time() - last_update > 5:
        result["connected"] = False

    return jsonify(result)


@app.route("/api/servo", methods=["POST"])
def servo_control():
    global arduino

    body = request.get_json(silent=True) or {}
    command = body.get("command", "").upper()

    if command not in ("O", "C"):
        return jsonify({
            "success": False,
            "message": "Invalid servo command."
        }), 400

    with serial_lock:
        if arduino is None or not arduino.is_open:
            return jsonify({
                "success": False,
                "message": "Arduino is not connected."
            }), 503

        try:
            arduino.write((command + "\n").encode("utf-8"))

            return jsonify({
                "success": True,
                "message": "Servo command sent."
            })

        except serial.SerialException as error:
            print("SERVO ERROR:", error)

            return jsonify({
                "success": False,
                "message": "Could not send servo command."
            }), 500


if __name__ == "__main__":
    print("\n================================")
    print("       COLDWATCH SYSTEM")
    print("================================")

    reader = threading.Thread(
        target=serial_reader,
        daemon=True
    )
    reader.start()

    app.run(
        host="127.0.0.1",
        port=5000,
        debug=False,
        use_reloader=False
    )
