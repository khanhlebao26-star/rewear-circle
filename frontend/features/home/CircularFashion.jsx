import Link from "next/link";
import { Icon } from "@/components/ui/Icon";
import styles from "./CircularFashion.module.css";

const impactReportUrl =
  "https://euric.org/resource-hub/reports-studies/study-lca-based-assessment-of-the-management-of-european-used-textiles";
const cottonWaterStudyUrl =
  "https://www.waterfootprint.org/resources/multimediahub/Chapagain_et_al_2006_cotton_2.pdf";

const cards = [
  {
    icon: "hanger",
    highlight: "15.420",
    unit: "+",
    title: "Món đồ tìm thấy người mặc tiếp theo",
    description:
      "Kéo dài thêm trung bình 2,2 năm sử dụng cho mỗi sản phẩm, giảm tải triệt để nhu cầu sản xuất mới dư thừa.",
    caption: "Độ tuần hoàn",
    badge: "+38% quý này",
  },
  {
    icon: "droplet",
    highlight: "38,5",
    unit: "triệu L",
    title: "Nước ngọt nguyên chất được giữ lại",
    description:
      "Tương đương nhu cầu nước sinh hoạt tiêu chuẩn của hơn 500 hộ gia đình trong suốt một năm ròng rã.",
    caption: "Dấu chân nước tham chiếu",
    badge: "~2.700 L / áo thun cotton",
  },
  {
    icon: "leaf",
    highlight: "12,4",
    unit: "tấn CO₂e",
    title: "Cắt giảm phát thải vào bầu khí quyển",
    description:
      "Khi thay thế một món mới, đồ đã qua sử dụng có thể giảm nhu cầu sản xuất sợi, nhuộm và xử lý vải.",
    caption: "Đo lường theo",
    badge: "Phương pháp LCA",
  },
  {
    icon: "repeat",
    highlight: "4.800",
    unit: "+",
    title: "Tủ đồ đã tham gia tuần hoàn xanh",
    description:
      "Mạng lưới những cá nhân yêu thích ăn mặc có gu, trân trọng đường kim mũi chỉ và trách nhiệm với môi trường.",
    caption: "Thành viên năng động",
    badge: "Toàn quốc",
  },
];

export default function CircularFashion() {
  return (
    <section
      id="thoi-trang-tuan-hoan"
      className={styles.section}
      aria-labelledby="circular-fashion-title"
    >
      <div className="shell">
        <div className={styles.intro}>
          <p className={styles.eyebrow}>
            03 / Thời trang tuần hoàn · Lan tỏa ý thức xanh
          </p>
          <h2 id="circular-fashion-title">
            Mỗi món đồ trao đi,
            <em>một hành tinh bớt gánh nặng.</em>
          </h2>
          <p className={styles.lead}>
            Khi trao một món còn tốt cho người mặc tiếp theo, bạn giúp kéo dài
            vòng đời của món đồ và giữ nó trong tủ đồ lâu hơn.
          </p>
        </div>

        <p className={styles.sampleNote} id="impact-sample-note">
          Số liệu minh họa từ bản thiết kế.
        </p>
        <div
          className={styles.cards}
          role="group"
          aria-describedby="impact-sample-note"
        >
          {cards.map((card) => (
            <article key={card.icon} className={styles.card}>
              <span className={styles.icon}>
                <Icon name={card.icon} size={19} />
              </span>
              <p className={styles.highlight}>
                {card.highlight} <span>{card.unit}</span>
              </p>
              <h3>{card.title}</h3>
              <p className={styles.description}>{card.description}</p>
              <div className={styles.cardBottom}>
                <span>{card.caption}</span>
                <span className={styles.badge}>{card.badge}</span>
              </div>
            </article>
          ))}
        </div>

        <div className={styles.callout}>
          <div>
            <p className={styles.kicker}>Bạn có biết?</p>
            <h3>
              Một chiếc <em>áo thun cotton mới</em> có dấu chân nước khoảng{" "}
              <strong>2.700 lít</strong>.
            </h3>
            <p className={styles.description}>
              Ước tính cho áo nặng 250 g theo{" "}
              <a
                href={cottonWaterStudyUrl}
                target="_blank"
                rel="noopener noreferrer"
              >
                Chapagain và cộng sự (2006)
              </a>
              . Lợi ích khi mua đồ cũ phụ thuộc vào việc món đó có thay thế một
              món mua mới hay không.
            </p>
          </div>
          <div className={styles.actions}>
            <a
              href={impactReportUrl}
              className="btn"
              target="_blank"
              rel="noopener noreferrer"
            >
              Xem báo cáo tác động chi tiết <Icon name="arrow" size={16} />
            </a>
            <Link href="/sell" className="btn quiet">
              Bắt đầu dọn tủ đồ của bạn
            </Link>
          </div>
          <span className={styles.stamp} aria-hidden="true">
            <span>
              Circular
              <br />✦<br />
              Mindset
            </span>
          </span>
        </div>

        <ul className={styles.benefits}>
          <li>
            <Icon name="check" size={15} /> Tin đăng được duyệt trước khi hiển
            thị
          </li>
          <li>
            <Icon name="repeat" size={15} /> Xem rõ tình trạng từng món đồ
          </li>
          <li>
            <Icon name="bag" size={15} /> Thanh toán khi nhận hàng
          </li>
        </ul>
      </div>
    </section>
  );
}
