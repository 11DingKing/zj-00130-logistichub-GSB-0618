import { Layout, Menu, Avatar, Dropdown, Space, Typography, Badge } from "antd";
import {
  DashboardOutlined,
  StockOutlined,
  InboxOutlined,
  SendOutlined,
  FileTextOutlined,
  DollarOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
  BellOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const MerchantLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: "/merchant", icon: <DashboardOutlined />, label: "商户总览" },
    { key: "/merchant/inventory", icon: <StockOutlined />, label: "我的库存" },
    { key: "/merchant/inbound", icon: <InboxOutlined />, label: "入库申请" },
    { key: "/merchant/outbound", icon: <SendOutlined />, label: "出库申请" },
    { key: "/merchant/leases", icon: <FileTextOutlined />, label: "租约管理" },
    { key: "/merchant/bills", icon: <DollarOutlined />, label: "我的账单" },
  ];

  const handleMenuClick = ({ key }) => {
    navigate(key);
  };

  const handleLogout = async () => {
    await logout();
    navigate("/login");
  };

  const userMenu = {
    items: [
      { key: "profile", icon: <UserOutlined />, label: "个人资料" },
      { key: "settings", icon: <SettingOutlined />, label: "账户设置" },
      { type: "divider" },
      {
        key: "logout",
        icon: <LogoutOutlined />,
        label: "退出登录",
        onClick: handleLogout,
      },
    ],
  };

  const getPageTitle = () => {
    const item = menuItems.find((i) => i.key === location.pathname);
    return item?.label || "商户中心";
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={220}
        style={{
          background: "linear-gradient(180deg, #002766 0%, #001529 100%)",
          position: "sticky",
          top: 0,
          height: "100vh",
          overflow: "auto",
        }}
      >
        <div
          style={{
            height: 64,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            color: "#fff",
            fontSize: 18,
            fontWeight: 600,
            borderBottom: "1px solid rgba(255,255,255,0.1)",
          }}
        >
          <StockOutlined style={{ marginRight: 8 }} />
          商户中心
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: "none", background: "transparent" }}
        />
      </Sider>
      <Layout>
        <Header
          style={{
            background: "#fff",
            padding: "0 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
            position: "sticky",
            top: 0,
            zIndex: 100,
          }}
        >
          <Title level={4} style={{ margin: 0 }}>
            {getPageTitle()}
          </Title>
          <Space size={24}>
            <Badge count={3} size="small">
              <BellOutlined
                style={{ fontSize: 20, cursor: "pointer", color: "#666" }}
              />
            </Badge>
            <Dropdown menu={userMenu} placement="bottomRight">
              <Space style={{ cursor: "pointer" }}>
                <Avatar
                  size={40}
                  icon={<UserOutlined />}
                  style={{ background: "#52c41a" }}
                />
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontSize: 14, fontWeight: 500 }}>
                    {user?.name}
                  </div>
                  <div style={{ fontSize: 12, color: "#888" }}>
                    {user?.companyName}
                  </div>
                </div>
              </Space>
            </Dropdown>
          </Space>
        </Header>
        <Content style={{ padding: 24, background: "#f0f2f5" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default MerchantLayout;
