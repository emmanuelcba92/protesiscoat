require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const emailjs = require('@emailjs/nodejs');

const app = express();
app.use(cors());
app.use(express.json());

// Inicializar Firebase Admin SDK (Reemplaza con tu JSON de credenciales de servicio)
// Debes descargar tu archivo de "Cuentas de servicio" desde Firebase Console
// y guardarlo como serviceAccountKey.json en la misma carpeta que este archivo.
try {
    const serviceAccount = require('./serviceAccountKey.json');
    admin.initializeApp({
        credential: admin.credential.cert(serviceAccount)
    });
} catch (error) {
    console.error("No se pudo iniciar Firebase. Asegúrate de tener serviceAccountKey.json", error);
}

const db = admin.firestore();

// Configuración EmailJS (Ahora estática y segura en el servidor)
const EMAILJS_SERVICE_ID = 'service_o4o0u4r';
const EMAILJS_TEMPLATE_ID = 'template_7xhq6tq';
const EMAILJS_PUBLIC_KEY = 'ZI8efqGOOC1hJM07-';
const EMAILJS_PRIVATE_KEY = process.env.EMAILJS_PRIVATE_KEY || ''; // Opcional pero recomendado en EmailJS Dashboard

// ==========================================
// ENDPOINTS
// ==========================================

// 1. Obtener todas las prótesis
app.get('/api/protesis', async (req, res) => {
    try {
        const snapshot = await db.collection('protesis').orderBy('fecha_pedido', 'desc').get();
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        res.json(data);
    } catch (error) {
        console.error("Error al obtener prótesis:", error);
        res.status(500).json({ error: 'Error al obtener datos' });
    }
});

// 2. Crear una nueva prótesis
app.post('/api/protesis', async (req, res) => {
    try {
        const newData = req.body;

        // Validar datos mínimos
        if (!newData.paciente || !newData.empresa || !newData.medico) {
            return res.status(400).json({ error: 'Faltan datos requeridos (paciente, empresa, medico)' });
        }

        const docRef = await db.collection('protesis').add(newData);
        const savedData = { id: docRef.id, ...newData };

        // Enviar correo de notificación de forma asíncrona
        enviarCorreo(newData).catch(console.error);

        res.status(201).json(savedData);
    } catch (error) {
        console.error("Error al crear prótesis:", error);
        res.status(500).json({ error: 'Error al guardar datos' });
    }
});

// 3. Actualizar una prótesis
app.put('/api/protesis/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const updateData = req.body;

        await db.collection('protesis').doc(id).update(updateData);
        res.json({ success: true, message: 'Prótesis actualizada' });
    } catch (error) {
        console.error("Error al actualizar prótesis:", error);
        res.status(500).json({ error: 'Error al actualizar datos' });
    }
});

// 4. Eliminar una prótesis (Protegido por PIN)
app.delete('/api/protesis/:id', async (req, res) => {
    try {
        const { id } = req.params;
        const { pin } = req.body; // El PIN se envía en el body de la petición DELETE

        // Validación del PIN en el servidor (Mucho más seguro que en el frontend)
        const SERVER_PIN = process.env.DELETE_PIN || '546287';

        if (pin !== SERVER_PIN) {
            return res.status(403).json({ error: 'PIN incorrecto. Operación denegada.' });
        }

        await db.collection('protesis').doc(id).delete();
        res.json({ success: true, message: 'Prótesis eliminada' });
    } catch (error) {
        console.error("Error al eliminar prótesis:", error);
        res.status(500).json({ error: 'Error al eliminar datos' });
    }
});

// 5. Actualización masiva
app.post('/api/protesis/bulk-update', async (req, res) => {
    try {
        const { ids, updateData } = req.body;

        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ error: 'Se requiere un arreglo de IDs' });
        }

        const batch = db.batch();

        ids.forEach(id => {
            const docRef = db.collection('protesis').doc(id);
            batch.update(docRef, updateData);
        });

        await batch.commit();
        res.json({ success: true, message: `${ids.length} registros actualizados` });
    } catch (error) {
        console.error("Error en actualización masiva:", error);
        res.status(500).json({ error: 'Error al actualizar datos masivamente' });
    }
});


// Función auxiliar para enviar correos
async function enviarCorreo(data) {
    // Parámetros para tu template de EmailJS
    // Asegúrate de que en tu panel de EmailJS el template use estas variables: {{paciente}}, {{medico}}, etc.
    const templateParams = {
        paciente: data.paciente,
        dni: data.dni || 'No especificado',
        medico: data.medico,
        empresa: data.empresa,
        tubos: data.tubos,
        recibe: data.recibe || 'No especificado',
        fecha_recepcion: data.fecha_pedido,
        notas: data.notas || 'Sin observaciones'
    };

    try {
        const result = await emailjs.send(
            EMAILJS_SERVICE_ID,
            EMAILJS_TEMPLATE_ID,
            templateParams,
            {
                publicKey: EMAILJS_PUBLIC_KEY,
                privateKey: EMAILJS_PRIVATE_KEY,
            }
        );
        console.log("✅ EmailJS: Notificación enviada con éxito!", result.status, result.text);
    } catch (error) {
        console.error("❌ EmailJS: Error al enviar el correo:", error);
    }
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
    console.log(`Para probar el servidor, asegúrate de configurar tu archivo .env y el serviceAccountKey.json`);
});
