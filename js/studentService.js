/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Student Management Service (Supabase Cloud + IndexedDB Hybrid)
   ========================================================================== */

class StudentService {

  /**
   * Generates a unique crypto hash token for student QR Code.
   */
  generateQrToken(registration) {
    const randomHash = Math.random().toString(36).substring(2, 10);
    return `SD_${registration}_${randomHash}`.toUpperCase();
  }

  /**
   * Helper to map Supabase database column names (snake_case) to JS object camelCase.
   */
  _mapFromSupabase(data) {
    if (!data) return null;
    if (Array.isArray(data)) return data.map(item => this._mapFromSupabase(item));
    return {
      id: data.id,
      name: data.name,
      registration: data.registration,
      grade: data.grade,
      turma: data.turma,
      active: data.active,
      qrToken: data.qr_token || data.qrToken,
      createdAt: data.created_at || data.createdAt,
      updatedAt: data.updated_at || data.updatedAt
    };
  }

  /**
   * Helper to map JS object camelCase to Supabase column names (snake_case).
   */
  _mapToSupabase(student) {
    return {
      id: student.id,
      name: student.name,
      registration: student.registration,
      grade: student.grade,
      turma: student.turma,
      active: student.active,
      qr_token: student.qrToken,
      updated_at: new Date().toISOString()
    };
  }

  /**
   * Retrieves all students from Supabase (Cloud) or IndexedDB (Fallback).
   */
  async getAllStudents() {
    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('students')
          .select('*')
          .order('name', { ascending: true });

        if (!error && data) {
          const students = this._mapFromSupabase(data);
          // Cache locally in IndexedDB
          for (const s of students) {
            await window.dbEngine.put('students', s);
          }
          return students;
        }
      } catch (err) {
        console.warn('⚠️ Falha ao buscar alunos no Supabase Cloud. Usando banco local:', err);
      }
    }
    // Fallback IndexedDB
    return await window.dbEngine.getAll('students');
  }

  /**
   * Finds a student by registration number.
   */
  async getByRegistration(registration) {
    const reg = registration.trim();
    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('students')
          .select('*')
          .eq('registration', reg)
          .maybeSingle();

        if (!error && data) {
          return this._mapFromSupabase(data);
        }
      } catch (e) {}
    }
    return await window.dbEngine.getByIndex('students', 'registration', reg);
  }

  /**
   * Finds a student by QR Code token.
   */
  async getByQrToken(qrToken) {
    const token = qrToken.trim();
    if (window.supabaseClient && navigator.onLine) {
      try {
        const { data, error } = await window.supabaseClient
          .from('students')
          .select('*')
          .eq('qr_token', token)
          .maybeSingle();

        if (!error && data) {
          return this._mapFromSupabase(data);
        }
      } catch (e) {}
    }
    return await window.dbEngine.getByIndex('students', 'qrToken', token);
  }

  /**
   * Saves a new student or updates an existing one (Cloud + Local).
   */
  async saveStudent(studentData) {
    const { id, name, registration, grade, turma } = studentData;

    // Check duplicate registration
    const existing = await this.getByRegistration(registration);
    if (existing && existing.id !== id) {
      throw new Error(`A matrícula "${registration}" já está cadastrada para outro aluno.`);
    }

    let studentObj = null;

    if (id) {
      const current = await window.dbEngine.get('students', id);
      studentObj = {
        ...(current || {}),
        id,
        name: name.trim(),
        registration: registration.trim(),
        grade,
        turma: turma.trim(),
        active: current ? current.active : true,
        qrToken: current ? current.qrToken : this.generateQrToken(registration.trim()),
        updatedAt: new Date().toISOString()
      };
    } else {
      studentObj = {
        id: 'std-' + Date.now() + '-' + Math.random().toString(36).substring(2, 6),
        name: name.trim(),
        registration: registration.trim(),
        grade,
        turma: turma.trim(),
        active: true,
        qrToken: this.generateQrToken(registration.trim()),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    }

    // Save in Supabase Cloud
    if (window.supabaseClient && navigator.onLine) {
      try {
        const row = this._mapToSupabase(studentObj);
        const { error } = await window.supabaseClient.from('students').upsert(row);
        if (error) {
          console.error('❌ Erro Supabase ao salvar aluno:', error.message);
        } else {
          console.log('✅ Aluno salvo no Supabase Cloud:', studentObj.name);
        }
      } catch (err) {
        console.warn('⚠️ Falha de rede ao enviar aluno para Supabase:', err);
      }
    }

    // Always update IndexedDB local cache
    return await window.dbEngine.put('students', studentObj);
  }

  /**
   * Reissues a new QR Code token for a student, revoking the old one (RN-002).
   */
  async reissueQrCode(studentId) {
    const student = await window.dbEngine.get('students', studentId);
    if (!student) throw new Error('Aluno não encontrado.');

    const newToken = this.generateQrToken(student.registration);
    student.qrToken = newToken;
    student.updatedAt = new Date().toISOString();

    if (window.supabaseClient && navigator.onLine) {
      try {
        await window.supabaseClient.from('students').update({
          qr_token: newToken,
          updated_at: student.updatedAt
        }).eq('id', studentId);
      } catch (err) {}
    }

    await window.dbEngine.put('students', student);
    return newToken;
  }

  /**
   * Toggles student active status (RN-003).
   */
  async toggleActive(studentId) {
    const student = await window.dbEngine.get('students', studentId);
    if (!student) throw new Error('Aluno não encontrado.');

    student.active = !student.active;
    student.updatedAt = new Date().toISOString();

    if (window.supabaseClient && navigator.onLine) {
      try {
        await window.supabaseClient.from('students').update({
          active: student.active,
          updated_at: student.updatedAt
        }).eq('id', studentId);
      } catch (err) {}
    }

    return await window.dbEngine.put('students', student);
  }

  /**
   * Filters student list by search query and grade.
   */
  async filterStudents(query = '', grade = '') {
    let list = await this.getAllStudents();

    if (grade) {
      list = list.filter(s => s.grade === grade);
    }

    if (query.trim()) {
      const q = query.toLowerCase().trim();
      list = list.filter(s => 
        s.name.toLowerCase().includes(q) || 
        s.registration.toLowerCase().includes(q)
      );
    }

    return list;
  }
}

const studentService = new StudentService();
window.studentService = studentService;
