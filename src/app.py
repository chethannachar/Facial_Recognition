from flask import Flask, request, jsonify
from flask_cors import CORS
import base64
import io
from PIL import Image
from transformers import AutoImageProcessor, AutoModelForImageClassification
import torch

app = Flask(__name__)
CORS(app)

# Load model and processor
processor = AutoImageProcessor.from_pretrained("dima806/facial_emotions_image_detection")
model = AutoModelForImageClassification.from_pretrained("dima806/facial_emotions_image_detection")

@app.route('/predict', methods=['POST'])
def predict():
    data = request.get_json()
    if 'image' not in data:
        return jsonify({'error': 'No image provided'}), 400

    try:
        image_data = base64.b64decode(data['image'])
        image = Image.open(io.BytesIO(image_data)).convert("RGB")
        image = image.resize((224, 224))  # Resize for consistency

        inputs = processor(images=image, return_tensors="pt")
        with torch.no_grad():
            outputs = model(**inputs)
        logits = outputs.logits
        predicted_class_idx = logits.argmax(-1).item()
        predicted_class = model.config.id2label[predicted_class_idx]
        confidence = torch.nn.functional.softmax(logits, dim=1)[0][predicted_class_idx].item()

        return jsonify({
            'emotion': predicted_class,
            'confidence': round(confidence, 3)
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

if __name__ == '__main__':
    app.run(debug=True)
