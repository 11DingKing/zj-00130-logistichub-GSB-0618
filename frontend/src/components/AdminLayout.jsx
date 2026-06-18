import { Layout, Menu, Avatar, Dropdown, Space, Typography } from "antd";
import {
  DashboardOutlined,
  AppstoreOutlined,
  InboxOutlined,
  SendOutlined,
  StockOutlined,
  SwapOutlined,
  FileTextOutlined,
  DollarOutlined,
  BarChartOutlined,
  TeamOutlined,
  UserOutlined,
  LogoutOutlined,
  SettingOutlined,
} from "@ant-design/icons";
import { useAuth } from "../context/AuthContext";
import { useNavigate, useLocation } from "react-router-dom";

const { Header, Sider, Content } = Layout;
const { Title } = Typography;

const AdminLayout = ({ children }) => {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { key: "/admin", icon: <DashboardOutlined />, label: "运营总览" },
    { key: "/admin/locations", icon: <AppstoreOutlined />, label: "库位管理" },
    { key: "/admin/inbound", icon: <InboxOutlined />, label: "入库管理" },
    { key: "/admin/outbound", icon: <SendOutlined />, label: "出库管理" },
    { key: "/admin/inventory", icon: <StockOutlined />, label: "库存管理" },
    { key: "/admin/transfers", icon: <SwapOutlined />, label: "移库管理" },
    { key: "/admin/leases", icon: <FileTextOutlined />, label: "租约管理" },
    { key: "/admin/bills", icon: <DollarOutlined />, label: "账单管理" },
    { key: "/admin/stats", icon: <BarChartOutlined />, label: "统计分析" },
    { key: "/admin/merchants", icon: <TeamOutlined />, label: "商户管理" },
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
      { key: "profile", icon: <UserOutlined />, label: "个人中心" },
      { key: "settings", icon: <SettingOutlined />, label: "系统设置" },
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
    return item?.label || "物流枢纽运营平台";
  };

  return (
    <Layout style={{ minHeight: "100vh" }}>
      <Sider
        width={220}
        style={{
          background: "#001529",
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
          <AppstoreOutlined style={{ marginRight: 8 }} />
          物流枢纽
        </div>
        <Menu
          theme="dark"
          mode="inline"
          selectedKeys={[location.pathname]}
          items={menuItems}
          onClick={handleMenuClick}
          style={{ borderRight: "none" }}
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
          <Dropdown menu={userMenu} placement="bottomRight">
            <Space style={{ cursor: "pointer" }}>
              <Avatar
                size={40}
                icon={<UserOutlined />}
                style={{ background: "#1890ff" }}
              />
              <div style={{ textAlign: "left" }}>
                <div style={{ fontSize: 14, fontWeight: 500 }}>
                  {user?.name}
                </div>
                <div style={{ fontSize: 12, color: "#888" }}>管理员</div>
              </div>
            </Space>
          </Dropdown>
        </Header>
        <Content style={{ padding: 24, background: "#f0f2f5" }}>
          {children}
        </Content>
      </Layout>
    </Layout>
  );
};

export default AdminLayout;
