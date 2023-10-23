import { Attachment } from '@ioc:Adonis/Addons/AttachmentLite'
import type { HttpContextContract } from '@ioc:Adonis/Core/HttpContext'
import { schema } from '@ioc:Adonis/Core/Validator'
import Drive from '@ioc:Adonis/Core/Drive'
import Database from '@ioc:Adonis/Lucid/Database'
import { cuid } from '@ioc:Adonis/Core/Helpers'
import FaceApi from 'App/Services/FaceApi'
import Face from 'App/Models/Face'

export default class FacesController {
  public async index({}: HttpContextContract) {}

  public async store({ request,response}: HttpContextContract) {

    const { face, user_id } = await request.validate({
      schema: schema.create({
        face: schema.file({
          extnames: ['jpg', 'png'],
        }),
        user_id: schema.string(),
      }),
    })

    const faceDescriptor = await FaceApi.tranformToDescriptor(face.tmpPath!)
    if (!faceDescriptor) return response.unprocessableEntity()

    const faceFile = new Attachment({
      extname: 'json',
      mimeType: 'application/json',
      size: Buffer.from(faceDescriptor.toString()).length,
      name: `${cuid()}.json`,
    })

    faceFile.isPersisted = true

    return await Database.transaction(async () => {
      const faceModel = new Face()
      faceModel.userId = user_id
      faceModel.file = faceFile

      await faceModel.save()

      await Drive.put(faceFile.name, faceDescriptor.toString())

      return faceModel.serialize()
    })
  }

  
  public async comparison({ request, response }: HttpContextContract) {
    try {
      const { face, user_id } = await request.validate({
            schema: schema.create({
            face: schema.file({
              extnames: ['jpg', 'png'],
            }),
            user_id: schema.string(),
            }),
         });

      const existingFace = await Face.query()
          .where('user_id', user_id) // Kriteria pemilihan berdasarkan user ID
          .firstOrFail();

      if (!existingFace) {
        throw new Error('Face model not registered yet')
      }

      const faceRef = FaceApi.loadFromString(
        (await Drive.get(existingFace.file.name)).toString()
      ).descriptor
      const faceQuery = (await FaceApi.tranformToDescriptor(face.tmpPath!))?.descriptor
      
      if (!faceQuery) {
        throw new Error('Face not detected')
      }

      // matcher foto
      const matcher = FaceApi.matcher(faceRef, faceQuery)
      if (!matcher) {
        throw new Error('Face not match')
      }

      return response.status(200).json({message:'Berhasil dibandingkan',status:200,data: matcher})
    } catch (error) {
        // Tangkap pengecualian jika data tidak ditemukan
        if (error.code === 'E_ROW_NOT_FOUND') {
          return response.notFound('Data user dan wajah tidak ditemukan');
        } else if (error.message === 'Face not detected') {
           return response.badRequest('Wajah tidak terdeteksi');
        } else if (error.message === 'Face not match') {
          // Handle kesalahan "Face not match" dengan respons khusus
          return response.badRequest('Wajah tidak cocok');
        } else {
          // Handle kesalahan lainnya jika ada
          return response.internalServerError('Terjadi kesalahan dalam pembandingan data');
        }
    }
    
  }

  public async update({ request, response}: HttpContextContract) {
    const { face, user_id } = await request.validate({
      schema: schema.create({
        face: schema.file({
          extnames: ['jpg', 'png'],
        }),
        user_id: schema.string(),
      }),
    });

    const faceDescriptor = await FaceApi.tranformToDescriptor(face.tmpPath!)
    if (!faceDescriptor) return response.unprocessableEntity()

    const faceFile = new Attachment({
      extname: 'json',
      mimeType: 'application/json',
      size: Buffer.from(faceDescriptor.toString()).length,
      name: `${cuid()}.json`,
    })

    faceFile.isPersisted = true

    return await Database.transaction(async () => {
     try {
        const existingFaceModel = await Face.query()
          .where('user_id', user_id) // Kriteria pemilihan berdasarkan user ID
          .firstOrFail();

        // Jika data sudah ada, lakukan operasi pembaruan
        existingFaceModel.file = faceFile;
        await existingFaceModel.save();

        // Simpan data wajah ke penyimpanan (Drive) dalam transaksi yang sama.
        await Drive.put(faceFile.name, faceDescriptor.toString());

        return existingFaceModel.serialize();
      } catch (error) {
        // Tangkap pengecualian jika data tidak ditemukan
        if (error.code === 'E_ROW_NOT_FOUND') {
          return response.notFound('Data user dan wajah tidak ditemukan');
        } else {
          // Handle kesalahan lainnya jika ada
          return response.internalServerError('Terjadi kesalahan dalam pembaruan data');
        }
      }
    });

  }

  public async destroy({}: HttpContextContract) {}
}
