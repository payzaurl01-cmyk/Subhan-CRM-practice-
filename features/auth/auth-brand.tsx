import Image from "next/image";

export function AuthBrand() {
  return (
    <div className="login-brand">
      <span className="login-logo">
        <Image
          src="/logo.jpeg"
          alt="Interior Blinds & Shutters"
          width={300}
          height={300}
          preload
        />
      </span>
      <div>
        <strong>Interior Blinds</strong>
        <small>Operations CRM</small>
      </div>
    </div>
  );
}
