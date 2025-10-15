import bcrypt from "bcryptjs";

// 6 haneli numeric kod üret
export const generatePlainCode = () => {
  let code = "";
  const digits = "0123456789";
  for (let i = 0; i < 6; i++) code += digits[Math.floor(Math.random() * digits.length)];
  return code;
};

// yeni kod üretip hashle
export const generateHashedCode = async () => {
  const plain = generatePlainCode();
  const hash = await bcrypt.hash(plain, 10);
  return { plain, hash };
};

// kod doğrulama
export const isValidCode = async (plain, hash) => bcrypt.compare(plain, hash);
