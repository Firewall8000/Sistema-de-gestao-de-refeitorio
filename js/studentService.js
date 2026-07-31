/* ==========================================================================
   SANTOS DUMONT - REFECTORY QR SYSTEM
   Student Management Service
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
   * Retrieves all students from IndexedDB.
   */
  async getAllStudents() {
    return await window.dbEngine.getAll('students');
  }

  /**
   * Finds a student by registration number.
   */
  async getByRegistration(registration) {
    return await window.dbEngine.getByIndex('students', 'registration', registration.trim());
  }

  /**
   * Finds a student by QR Code token.
   */
  async getByQrToken(qrToken) {
    return await window.dbEngine.getByIndex('students', 'qrToken', qrToken.trim());
  }

  /**
   * Saves a new student or updates an existing one.
   */
  async saveStudent(studentData) {
    const { id, name, registration, grade, turma } = studentData;

    // Check duplicate registration
    const existing = await this.getByRegistration(registration);
    if (existing && existing.id !== id) {
      throw new Error(`A matrícula "${registration}" já está cadastrada para outro aluno.`);
    }

    if (id) {
      // Update existing
      const current = await window.dbEngine.get('students', id);
      if (!current) throw new Error('Aluno não encontrado para atualização.');

      const updated = {
        ...current,
        name: name.trim(),
        registration: registration.trim(),
        grade,
        turma: turma.trim(),
        updatedAt: new Date().toISOString()
      };
      return await window.dbEngine.put('students', updated);
    } else {
      // Create new
      const newStudent = {
        id: 'std-' + Date.now(),
        name: name.trim(),
        registration: registration.trim(),
        grade,
        turma: turma.trim(),
        active: true,
        qrToken: this.generateQrToken(registration.trim()),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
      return await window.dbEngine.put('students', newStudent);
    }
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
