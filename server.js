require('dotenv').config();
const express = require('express');
const cors = require('cors');
const admin = require('firebase-admin');
const nodemailer = require('nodemailer');

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

// Configurar Nodemailer para enviar correos (Reemplaza con tus datos SMTP)
// Esto reemplaza a EmailJS en el frontend
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST || 'smtp.gmail.com', // Ejemplo con Gmail
    port: process.env.SMTP_PORT || 587,
    secure: false, // true para 465, false para otros puertos
    auth: {
        user: process.env.SMTP_USER,
        pass: process.env.SMTP_PASS 
    }
});

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
        if(!newData.paciente || !newData.empresa || !newData.medico) {
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
        
        if(!Array.isArray(ids) || ids.length === 0) {
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
    if (!process.env.SMTP_USER || !process.env.SMTP_PASS || !process.env.EMAIL_TO) {
        console.warn("Credenciales SMTP no configuradas. Saltando envío de correo.");
        return;
    }

    const html = `
        <h2>Nueva solicitud de prótesis</h2>
        <p><strong>Paciente:</strong> ${data.paciente} (DNI: ${data.dni || 'No especificado'})</p>
        <p><strong>Médico:</strong> ${data.medico}</p>
        <p><strong>Empresa:</strong> ${data.empresa}</p>
        <p><strong>Tubos:</strong> ${data.tubos}</p>
        <p><strong>Recibe:</strong> ${data.recibe || 'N/A'}</p>
        <p><strong>Notas:</strong> ${data.notas || 'Sin notas'}</p>
    `;

    const mailOptions = {
        from: `"Sistema Prótesis" <${process.env.SMTP_USER}>`,
        to: process.env.EMAIL_TO, // Correo destino definido en .env
        subject: `Nueva Prótesis - ${data.paciente}`,
        html: html
    };

    await transporter.sendMail(mailOptions);
    console.log("Correo enviado correctamente");
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
    console.log(`Servidor Backend corriendo en http://localhost:${PORT}`);
    console.log(`Para probar el servidor, asegúrate de configurar tu archivo .env y el serviceAccountKey.json`);
});
